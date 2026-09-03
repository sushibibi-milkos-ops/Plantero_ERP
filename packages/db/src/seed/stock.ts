import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import {
  products, uoms, warehouses, locations, partners, stockLots, qcChecks, receipts,
} from '../schema/index.js';
import {
  D, SYSTEM_ACTOR, writeAudit,
  createLot, postStockMove,
  createAndReceive, type ReceiptLineInput,
  createTransfer, completeTransfer,
  createCount, snapshotCount, recordCount, submitReview, approveCount, postCount,
  getSuppliersLocation, getQuarantineLocation, getRejectedLocation,
  nextDocNo, nextLotNo,
} from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * `postStockMove`/`postJournalEntry` kendi audit satırlarını (`stock_moves`/`journal_entries`) zaten
 * yazar (bkz. `stock/ledger.ts`, `accounting/journal.ts`). Ama `createLot`/`createReceipt`/`createTransfer`/
 * `createCount` gibi belge/lot oluşturan servisler audit yazmaz — bunu normalde web tarafındaki
 * `withAudit` sarmalayıcısı yapar (`apps/web/src/lib/actions.ts`). Seed, server action katmanını
 * atladığı için I17 (audit kapsamı) denetimini geçmek adına aynı satırları burada elle yazar.
 */
async function auditCreate(tx: DbOrTx, tableName: string, recordId: string, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName, recordId, summary }, SYSTEM_ACTOR);
}
async function auditPost(tx: DbOrTx, tableName: string, recordId: string, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'post', tableName, recordId, summary }, SYSTEM_ACTOR);
}
/** `receiveGoods` mal kabul satırı başına `createLot` çağırır (kabul + varsa red lotu) — bunlar için de I17 satırı gerekir. */
async function auditReceiptLots(tx: DbOrTx, docNo: string, createdLotIds: string[]): Promise<void> {
  for (const lotId of createdLotIds) await auditCreate(tx, 'stock_lots', lotId, `Mal kabul ${docNo} ile lot oluşturuldu`);
}

/**
 * Depo modülü seed'i — docs/modules/depo.md §19.
 * Stok yazımı yalnızca `@plantero/core` servisleri üzerinden yapılır (postStockMove/createLot/
 * createAndReceive/createTransfer/createCount vb.) — elle insert yok. Aktör: SYSTEM_ACTOR
 * (`userId: null`), audit satırları `system@plantero.local` olarak düşer.
 *
 * ÖNEMLİ tarih kısıtı: `packages/db/src/seed/accounting.ts` Ocak–Temmuz 2026 dönemlerini kapalı
 * (`is_closed=true`) açar; yalnızca Ağustos ve sonrası açıktır. Bu yüzden tüm değerli hareketler
 * (opening/receipt/count_gain/count_loss) 2026-08-01 .. bugün aralığında tarihlenir — aksi halde
 * `postJournalEntry` PERIOD_CLOSED ile patlar. "Açılış" bakiyesi kavramsal olarak üretime başlama
 * tarihinden (20.07.2026) önce olsa da, muhasebe dönemi kapalı olduğundan Ağustos başına alınmıştır
 * (rapora not düşülür).
 */

const OPEN_FROM = '2026-08-01';
const addDaysStr = (base: string, days: number): string => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dateAt = (isoDay: string): Date => new Date(`${isoDay}T09:00:00Z`);
/** Bugünün tarihi — SKT dağılımı (doc §19: <30/45-60/120-400 gün) seed'in çalıştığı ana göre hesaplanır,
 * `OPEN_FROM`'a göre DEĞİL (aksi halde "yakın vadeli" lotlar geçmişte kalır). */
const TODAY = new Date().toISOString().slice(0, 10);

/* ==================================================================== */
/* Referans veri yükleyiciler                                           */
/* ==================================================================== */

async function loc(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(locations).where(eq(locations.code, code)).limit(1);
  if (!row) throw new Error(`seed:stock — lokasyon bulunamadı: ${code}`);
  return row;
}
async function wh(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(warehouses).where(eq(warehouses.code, code)).limit(1);
  if (!row) throw new Error(`seed:stock — depo bulunamadı: ${code}`);
  return row;
}
async function uom(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(uoms).where(eq(uoms.code, code)).limit(1);
  if (!row) throw new Error(`seed:stock — birim bulunamadı: ${code}`);
  return row;
}
async function partnerByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(partners).where(eq(partners.code, code)).limit(1);
  if (!row) throw new Error(`seed:stock — cari bulunamadı: ${code}`);
  return row;
}
async function productBySku(tx: DbOrTx, sku: string) {
  const [row] = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!row) throw new Error(`seed:stock — ürün bulunamadı (SKU): ${sku}`);
  return row;
}

/* ==================================================================== */
/* 1) Hammadde + ambalaj açılış stokları                                 */
/* ==================================================================== */

/** Excel'den gelen 29 hammadde SKU'su — makul birim maliyet (TL/kg), doc §19 çıpa fiyatlarına göre. */
const RAW_MATERIALS: Array<{ sku: string; cost: number; qty: number }> = [
  { sku: '304030000', cost: 180, qty: 80 }, // Alkalize Kakao
  { sku: '301030000', cost: 320, qty: 60 }, // Badem
  { sku: '306030000', cost: 150, qty: 100 }, // Brokoli + Ispanak
  { sku: '306050000', cost: 600, qty: 50 }, // Bromelain
  { sku: '307010000', cost: 260, qty: 60 }, // Cream
  { sku: '307020000', cost: 15, qty: 700 }, // Deniz Tuzu
  { sku: '301040000', cost: 280, qty: 65 }, // Fındık
  { sku: '303010000', cost: 450, qty: 55 }, // Guar Gum
  { sku: '306020000', cost: 200, qty: 75 }, // Hibiskus
  { sku: '308040000', cost: 90, qty: 160 }, // Hurma (Kuru, Çekirdeksiz)
  { sku: '302030000', cost: 120, qty: 125 }, // Hurma Şurubu
  { sku: '306010000', cost: 150, qty: 100 }, // Inulin
  { sku: '301010000', cost: 210, qty: 90 }, // Isolated Pea Protein
  { sku: '308010000', cost: 250, qty: 70 }, // Kahve Çekirdeği (Yeşil)
  { sku: '301050000', cost: 380, qty: 55 }, // Kaju
  { sku: '308020000', cost: 800, qty: 50 }, // Matcha Tozu (Toptan)
  { sku: '301020000', cost: 45, qty: 330 }, // Nohut Tozu
  { sku: '306040000', cost: 900, qty: 50 }, // Spriluna
  { sku: '306060000', cost: 500, qty: 50 }, // Strawberry
  { sku: '302010000', cost: 700, qty: 50 }, // Suklaroz
  { sku: '304010000', cost: 900, qty: 50 }, // Vanilya Aroması
  { sku: '308030000', cost: 600, qty: 50 }, // Vanilya Tozu (Toptan)
  { sku: '303020000', cost: 450, qty: 55 }, // Xhantam Gum
  { sku: '301060000', cost: 40, qty: 375 }, // Yulaf
  { sku: '305010000', cost: 1200, qty: 50 }, // b2+b12+e
  { sku: '304020000', cost: 900, qty: 50 }, // masker
  { sku: '302020000', cost: 650, qty: 50 }, // stevya
  { sku: '304050000', cost: 900, qty: 50 }, // Çilek Aroma Verici
  { sku: '304040000', cost: 900, qty: 50 }, // çikolata aroması
];

/** 7 ambalaj SKU'su — doc §19 "ambalaj 8-25 TL" aralığında. */
const PACKAGING: Array<{ sku: string; cost: number; qty: number }> = [
  { sku: '402010000', cost: 18, qty: 1500 }, // Doypack 1kg
  { sku: '401030000', cost: 8, qty: 5000 }, // Etiket
  { sku: '401020000', cost: 10, qty: 3000 }, // Kapak
  { sku: '401010000', cost: 22, qty: 2000 }, // Kavanoz 500ml
  { sku: '401040000', cost: 25, qty: 800 }, // Koli 6'lı
  { sku: '402030000', cost: 15, qty: 2500 }, // Kraft Kahve Torbası 250g
  { sku: '402020000', cost: 9, qty: 8000 }, // Saşe 10g
];

/** Ürün tipine göre dolaşımlı rafa koyma lokasyonları — açılış stoklarına lot/lokasyon çeşitliliği katar. */
const RAW_SHELVES = ['TIRE/HAM/R01/A', 'TIRE/HAM/R01/B', 'TIRE/HAM/R01/C', 'TIRE/HAM/R02/A', 'TIRE/HAM/R02/B', 'TIRE/HAM/R02/C', 'TIRE/HAM/R03/A', 'TIRE/HAM/R03/B', 'TIRE/HAM/R03/C'];
const MAMUL_SHELVES = ['TIRE/MAMUL/R01', 'TIRE/MAMUL/R02', 'TIRE/MAMUL/R03', 'TIRE/MAMUL/R04'];

type Placement = { sku: string; productId: string; lotId: string; lotNo: string; locationId: string; locationCode: string; qty: string; uomId: string; unitCost: string };

async function seedRawAndPackagingOpening(tx: DbOrTx, summary: SeedSummary): Promise<Placement[]> {
  const kg = await uom(tx, 'KG');
  const adet = await uom(tx, 'ADET');
  const suppliersLoc = await getSuppliersLocation(tx);
  const quarantineLoc = await getQuarantineLocation(tx, (await wh(tx, 'TIRE')).id);
  const rejectedLoc = await getRejectedLocation(tx, (await wh(tx, 'TIRE')).id);
  const rawShelves = await Promise.all(RAW_SHELVES.map((c) => loc(tx, c)));
  const ambLoc = await loc(tx, 'TIRE/AMB');

  const placements: Placement[] = [];
  let shelfIdx = 0;
  let lotCount = 0;

  // Karantina/red özel durumları — doc §19: "Karantinada 2 lot, 1 red lot"
  const QUARANTINE_SKUS = new Set(['301030000', '301040000']); // Badem, Fındık — en uzun vadeli lotları karantinada bekliyor
  const REJECT_SKU = '301050000'; // Kaju — karantinaya alınıp reddedilmiş 1 lot
  const EXPIRED_SKU = '307020000'; // Deniz Tuzu — SKT'si geçmiş 1 lot (skt panosu demo)

  let rawIdx = 0;
  for (const def of RAW_MATERIALS) {
    const product = await productBySku(tx, def.sku);
    const shelf = rawShelves[shelfIdx % rawShelves.length]!;
    shelfIdx += 1;

    // Tüm hammaddelere sabit +18/+52/+260 gün verilirse (önceki sürüm) 29 üründen doğan ~87 lot
    // aynı 3 SKT tarihinde kümelenir; SKT panosunda ve lot listesinde "kırmızı duvar" oluşur (her
    // lot aynı rozet, aciliyet farkı sıfırlanır). Ürün başına deterministik ama farklı bir ofset
    // üretip her lotu kendi 30/60/120-400 günlük dilimi içinde yayıyoruz (docs/modules/depo.md §19).
    const dayOffsetA = 3 + ((rawIdx * 7) % 26); // 3–28 gün (<30 dilimi)
    const dayOffsetB = 31 + ((rawIdx * 5) % 28); // 31–58 gün (45–60 dilimini de kapsayan orta vade)
    const dayOffsetC = 120 + ((rawIdx * 37) % 280); // 120–399 gün
    rawIdx += 1;

    // Lot A: yakın vadeli — bugüne göre <30 gün (veya Deniz Tuzu için SKT geçmiş)
    const expiryA = def.sku === EXPIRED_SKU ? addDaysStr(TODAY, -10) : addDaysStr(TODAY, dayOffsetA);
    const qtyA = Math.round(def.qty * 0.35);
    // Lot B: orta vadeli — 45-60 gün
    const expiryB = addDaysStr(TODAY, dayOffsetB);
    const qtyB = Math.round(def.qty * 0.35);
    // Lot C: uzun vadeli — 120-400 gün
    const expiryC = addDaysStr(TODAY, dayOffsetC);
    const qtyC = def.qty - qtyA - qtyB;

    const lots: Array<{ tag: string; expiry: string; qty: number; status: 'released' | 'quarantine' }> = [
      { tag: 'A', expiry: expiryA, qty: qtyA, status: 'released' },
      { tag: 'B', expiry: expiryB, qty: qtyB, status: 'released' },
      { tag: 'C', expiry: expiryC, qty: qtyC, status: QUARANTINE_SKUS.has(def.sku) || def.sku === REJECT_SKU ? 'quarantine' : 'released' },
    ];

    for (const l of lots) {
      const lotNo = `OP-${def.sku}-${l.tag}`;
      const targetLoc = l.status === 'quarantine' ? quarantineLoc : shelf;
      const movedAt = dateAt(addDaysStr(OPEN_FROM, shelfIdx % 12));
      const createdLot = await createLot(tx, {
        productId: product.id, lotNo, origin: 'opening', unitCost: D(def.cost), uomId: kg.id,
        expiryDate: l.expiry, productionDate: OPEN_FROM, status: l.status,
        note: 'Seed: ERP açılış envanteri (Ağustos 2026 fiziksel sayım)',
      }, SYSTEM_ACTOR);
      await auditCreate(tx, 'stock_lots', createdLot.id, `Açılış lotu ${lotNo} oluşturuldu (${product.name})`);
      await postStockMove(tx, {
        kind: 'opening', productId: product.id, lotId: createdLot.id, fromLocationId: suppliersLoc.id, toLocationId: targetLoc.id,
        qty: D(l.qty), uomId: kg.id, unitCost: D(def.cost), refType: 'stock_lot', refId: createdLot.id, refNo: lotNo,
        origin: 'manual', movedAt, note: 'Açılış bakiyesi',
      }, SYSTEM_ACTOR);
      lotCount += 1;

      if (def.sku === REJECT_SKU && l.tag === 'C') {
        // Karantina → red: gerçek red akışıyla aynı (postStockMove kind:'quarantine_reject' lot durumunu günceller)
        await postStockMove(tx, {
          kind: 'quarantine_reject', productId: product.id, lotId: createdLot.id, fromLocationId: quarantineLoc.id, toLocationId: rejectedLoc.id,
          qty: D(l.qty), uomId: kg.id, refType: 'stock_lot', refId: createdLot.id, refNo: lotNo, origin: 'manual',
          movedAt: dateAt(addDaysStr(OPEN_FROM, 3)), note: 'Seed: açılış sayımında numune uygunsuzluğu — red',
        }, SYSTEM_ACTOR);
      }

      placements.push({ sku: def.sku, productId: product.id, lotId: createdLot.id, lotNo, locationId: (l.status === 'quarantine' && def.sku !== REJECT_SKU) ? quarantineLoc.id : (l.status === 'quarantine' ? rejectedLoc.id : shelf.id), locationCode: l.status === 'quarantine' ? (def.sku === REJECT_SKU ? rejectedLoc.code : quarantineLoc.code) : shelf.code, qty: String(l.qty), uomId: kg.id, unitCost: String(def.cost) });
    }
  }
  summary.add('stock_lots (hammadde açılış)', lotCount);

  // Ambalaj — 2 lot/ürün, uzun raf ömrü (5 yıl); karantina/red yok.
  let packLotCount = 0;
  for (const def of PACKAGING) {
    const product = await productBySku(tx, def.sku);
    const tiers: Array<{ tag: string; expiry: string; qty: number }> = [
      { tag: 'A', expiry: addDaysStr(OPEN_FROM, 620), qty: Math.round(def.qty * 0.6) },
      { tag: 'B', expiry: addDaysStr(OPEN_FROM, 1400), qty: def.qty - Math.round(def.qty * 0.6) },
    ];
    for (const t of tiers) {
      const lotNo = `OP-${def.sku}-${t.tag}`;
      const createdLot = await createLot(tx, {
        productId: product.id, lotNo, origin: 'opening', unitCost: D(def.cost), uomId: adet.id,
        expiryDate: t.expiry, productionDate: OPEN_FROM, status: 'released',
        note: 'Seed: ERP açılış envanteri (Ağustos 2026 fiziksel sayım)',
      }, SYSTEM_ACTOR);
      await auditCreate(tx, 'stock_lots', createdLot.id, `Açılış lotu ${lotNo} oluşturuldu (${product.name})`);
      await postStockMove(tx, {
        kind: 'opening', productId: product.id, lotId: createdLot.id, fromLocationId: suppliersLoc.id, toLocationId: ambLoc.id,
        qty: D(t.qty), uomId: adet.id, unitCost: D(def.cost), refType: 'stock_lot', refId: createdLot.id, refNo: lotNo,
        origin: 'manual', movedAt: dateAt(addDaysStr(OPEN_FROM, 1)), note: 'Açılış bakiyesi',
      }, SYSTEM_ACTOR);
      packLotCount += 1;
      placements.push({ sku: def.sku, productId: product.id, lotId: createdLot.id, lotNo, locationId: ambLoc.id, locationCode: ambLoc.code, qty: String(t.qty), uomId: adet.id, unitCost: String(def.cost) });
    }
  }
  summary.add('stock_lots (ambalaj açılış)', packLotCount);

  return placements;
}

/* ==================================================================== */
/* 2) Mamul açılış stokları                                             */
/* ==================================================================== */

type FinishedDef = { sku: string; cost: number; qty: number; line: 'HAT1' | 'HAT2' | 'HAT3'; lots: 1 | 2; shelfLife: number | null };

/** 50 mamul SKU'su — kalem başına makul birim maliyet (₺/adet), pack_qty'ye göre ölçeklendirilmiş; hat ataması docs/PRODUCTION-LINES.md aile eşlemesine göre. */
const FINISHED: FinishedDef[] = [
  { sku: '140040101', cost: 105, qty: 60, line: 'HAT1', lots: 1, shelfLife: 365 }, // %100 Oat Chocolate Spredable
  { sku: '140040001', cost: 95, qty: 70, line: 'HAT1', lots: 1, shelfLife: 365 }, // %100 Oat Spredable
  { sku: '110010002', cost: 280, qty: 40, line: 'HAT1', lots: 1, shelfLife: 365 }, // 2x Badem Bazı
  { sku: '110020002', cost: 250, qty: 40, line: 'HAT1', lots: 1, shelfLife: 365 }, // 2x Fındık
  { sku: '110030002', cost: 320, qty: 35, line: 'HAT1', lots: 1, shelfLife: 365 }, // 2x Kaju Bazı
  { sku: '110010003', cost: 420, qty: 30, line: 'HAT1', lots: 1, shelfLife: 365 }, // 3x Badem Bazı
  { sku: '110020003', cost: 375, qty: 30, line: 'HAT1', lots: 1, shelfLife: 365 }, // 3x Fındık Bazı
  { sku: '110030003', cost: 480, qty: 25, line: 'HAT1', lots: 1, shelfLife: 365 }, // 3x Kaju Bazı
  { sku: '110010006', cost: 840, qty: 15, line: 'HAT1', lots: 1, shelfLife: 365 }, // 6x Badem Bazı
  { sku: '110020006', cost: 750, qty: 15, line: 'HAT1', lots: 1, shelfLife: 365 }, // 6x Fındık Bazı
  { sku: '110030006', cost: 960, qty: 12, line: 'HAT1', lots: 1, shelfLife: 365 }, // 6x Kaju Bazı
  { sku: '110010001', cost: 140, qty: 120, line: 'HAT1', lots: 2, shelfLife: 365 }, // BADEM BAZI
  { sku: '180010101', cost: 425, qty: 25, line: 'HAT1', lots: 1, shelfLife: 365 }, // BADEM FINDIK KAJU PAKET
  { sku: '180020201', cost: 460, qty: 20, line: 'HAT1', lots: 1, shelfLife: 365 }, // BADEM FINDIK KAJU_ PLAIN STRAWBERRY CHOCOLATE
  { sku: '180010301', cost: 480, qty: 20, line: 'HAT1', lots: 1, shelfLife: 365 }, // BADEM FINDIK YULAF KAJU PAKET
  { sku: '180010201', cost: 320, qty: 25, line: 'HAT1', lots: 1, shelfLife: 365 }, // BADEM FINDIK YULAF PAKET
  { sku: '120010001', cost: 155, qty: 90, line: 'HAT1', lots: 2, shelfLife: 365 }, // BARISTA BASE - BADEM BAZI
  { sku: '120020001', cost: 140, qty: 85, line: 'HAT1', lots: 1, shelfLife: 365 }, // BARISTA BASE - FINDIK BAZI
  { sku: '120030001', cost: 175, qty: 70, line: 'HAT1', lots: 1, shelfLife: 365 }, // BARISTA BASE - KAJU BAZI
  { sku: '120040001', cost: 65, qty: 100, line: 'HAT1', lots: 1, shelfLife: 365 }, // BARISTA BASE - YULAF BAZI
  { sku: '190010003', cost: 90, qty: 60, line: 'HAT1', lots: 1, shelfLife: 300 }, // Badem İçeceği 1L UHT (3'lü)
  { sku: '190010001', cost: 30, qty: 180, line: 'HAT1', lots: 2, shelfLife: 300 }, // Badem İçeceği 1L UHT (tekli)
  { sku: '190010012', cost: 360, qty: 20, line: 'HAT1', lots: 1, shelfLife: 300 }, // Badem İçeceği 1L UHT (12'li)
  { sku: '190010099', cost: 30, qty: 480, line: 'HAT1', lots: 1, shelfLife: 300 }, // Badem İçeceği 1L UHT (palet)
  { sku: '170003001', cost: 320, qty: 15, line: 'HAT2', lots: 1, shelfLife: null }, // Blender Mikser
  { sku: '130010101', cost: 195, qty: 70, line: 'HAT2', lots: 1, shelfLife: 365 }, // Double Chocolate Protein Mixi
  { sku: '110020001', cost: 125, qty: 140, line: 'HAT1', lots: 2, shelfLife: 365 }, // FINDIK BAZI
  { sku: '160080001', cost: 95, qty: 90, line: 'HAT1', lots: 1, shelfLife: 365 }, // Hurma Ezmesi
  { sku: '110030001', cost: 160, qty: 110, line: 'HAT1', lots: 2, shelfLife: 365 }, // KAJU BAZI
  { sku: '110030101', cost: 165, qty: 45, line: 'HAT1', lots: 1, shelfLife: 365 }, // Kaju Bazı ABD_alternatif
  { sku: '140030101', cost: 175, qty: 55, line: 'HAT1', lots: 1, shelfLife: 365 }, // Kakaolu Kaju Ezmesi
  { sku: '160060001', cost: 340, qty: 40, line: 'HAT2', lots: 1, shelfLife: 365 }, // Matcha
  { sku: '150040001', cost: 60, qty: 150, line: 'HAT3', lots: 2, shelfLife: 365 }, // Oat Coffee Creamer (10 saşe)
  { sku: '180020101', cost: 410, qty: 20, line: 'HAT1', lots: 1, shelfLife: 365 }, // PLAIN STRAWBERRRY CHOCOLATE
  { sku: '130010001', cost: 185, qty: 75, line: 'HAT2', lots: 1, shelfLife: 365 }, // Plain Protein Mixi
  { sku: '160020001', cost: 240, qty: 55, line: 'HAT2', lots: 1, shelfLife: 365 }, // Plantero COSTA RICA KAHVE
  { sku: '160030001', cost: 260, qty: 45, line: 'HAT2', lots: 1, shelfLife: 365 }, // Plantero Etihopia Guji Hambela Bontiana kahve
  { sku: '160010001', cost: 230, qty: 55, line: 'HAT2', lots: 1, shelfLife: 365 }, // Plantero Guatemala Huehuetenango Kahve
  { sku: '160040001', cost: 220, qty: 50, line: 'HAT2', lots: 1, shelfLife: 365 }, // Plantero Nikaragua Kahve
  { sku: '170020001', cost: 85, qty: 25, line: 'HAT2', lots: 1, shelfLife: null }, // Shaker
  { sku: '130010201', cost: 195, qty: 65, line: 'HAT2', lots: 1, shelfLife: 365 }, // Strawberry Protein Mixi
  { sku: '170004001', cost: 165, qty: 20, line: 'HAT2', lots: 1, shelfLife: null }, // Termos
  { sku: '160050001', cost: 140, qty: 80, line: 'HAT2', lots: 1, shelfLife: 365 }, // Türk Kahvesi
  { sku: '160070001', cost: 180, qty: 45, line: 'HAT2', lots: 1, shelfLife: 365 }, // Vanilya Tozu
  { sku: '110040001', cost: 55, qty: 200, line: 'HAT1', lots: 2, shelfLife: 365 }, // YULAF BAZI
  { sku: '170010001', cost: 240, qty: 18, line: 'HAT2', lots: 1, shelfLife: null }, // Yoga Matı
  { sku: '190040003', cost: 66, qty: 60, line: 'HAT1', lots: 1, shelfLife: 300 }, // Yulaf İçeceği 1L UHT (3'lü)
  { sku: '190040001', cost: 22, qty: 190, line: 'HAT1', lots: 2, shelfLife: 300 }, // Yulaf İçeceği 1L UHT (tekli)
  { sku: '190040012', cost: 264, qty: 20, line: 'HAT1', lots: 1, shelfLife: 300 }, // Yulaf İçeceği 1L UHT (12'li)
  { sku: '190040099', cost: 22, qty: 480, line: 'HAT1', lots: 1, shelfLife: 300 }, // Yulaf İçeceği 1L UHT (palet)
];

const PROD_DAYS = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-27'];

async function seedFinishedOpening(tx: DbOrTx, summary: SeedSummary): Promise<Placement[]> {
  const adet = await uom(tx, 'ADET');
  const suppliersLoc = await getSuppliersLocation(tx);
  const mamulShelves = await Promise.all(MAMUL_SHELVES.map((c) => loc(tx, c)));
  const placements: Placement[] = [];

  let idx = 0;
  let lotCount = 0;
  for (const def of FINISHED) {
    const product = await productBySku(tx, def.sku);
    const shelf = mamulShelves[idx % mamulShelves.length]!;
    const prodDay = PROD_DAYS[idx % PROD_DAYS.length]!;
    idx += 1;

    const perLot = def.lots === 2 ? [Math.round(def.qty * 0.6), def.qty - Math.round(def.qty * 0.6)] : [def.qty];
    for (let i = 0; i < perLot.length; i += 1) {
      const qty = perLot[i]!;
      const lotNo = await nextLotNo(tx, def.line, dateAt(prodDay));
      const expiryDate = def.shelfLife ? addDaysStr(prodDay, def.shelfLife) : null;
      const createdLot = await createLot(tx, {
        productId: product.id, lotNo, origin: 'opening', unitCost: D(def.cost), uomId: adet.id,
        expiryDate, productionDate: prodDay, status: 'released',
        note: 'Seed: ERP açılış envanteri — devreden mamul stoğu',
      }, SYSTEM_ACTOR);
      await auditCreate(tx, 'stock_lots', createdLot.id, `Açılış lotu ${lotNo} oluşturuldu (${product.name})`);
      await postStockMove(tx, {
        kind: 'opening', productId: product.id, lotId: createdLot.id, fromLocationId: suppliersLoc.id, toLocationId: shelf.id,
        qty: D(qty), uomId: adet.id, unitCost: D(def.cost), refType: 'stock_lot', refId: createdLot.id, refNo: lotNo,
        origin: 'manual', movedAt: dateAt(addDaysStr(prodDay, 2)), note: 'Açılış bakiyesi',
      }, SYSTEM_ACTOR);
      lotCount += 1;
      placements.push({ sku: def.sku, productId: product.id, lotId: createdLot.id, lotNo, locationId: shelf.id, locationCode: shelf.code, qty: String(qty), uomId: adet.id, unitCost: String(def.cost) });
    }
  }
  summary.add('stock_lots (mamul açılış)', lotCount);
  return placements;
}

/* ==================================================================== */
/* 3) Mal kabul belgeleri (6 adet, manuel origin)                       */
/* ==================================================================== */

async function seedReceipts(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const kg = await uom(tx, 'KG');
  const adet = await uom(tx, 'ADET');
  const tire = await wh(tx, 'TIRE');

  const line = (sku: string, uomId: string, qty: number, unitCost: number, extra: Partial<ReceiptLineInput> = {}): Promise<ReceiptLineInput> =>
    productBySku(tx, sku).then((p) => ({ productId: p.id, uomId, qty: D(qty), unitCost: D(unitCost), disposition: 'released' as const, ...extra }));

  // R1 — Proteinsan: Isolated Pea Protein
  const supProteinsan = await partnerByCode(tx, 'S-000001');
  const r1lines = [await line('301010000', kg.id, 120, 210, { supplierLotNo: 'PSN-2609-01', expiryDate: addDaysStr(OPEN_FROM, 480) })];
  const r1 = await createAndReceive(tx, { warehouseId: tire.id, partnerId: supProteinsan.id, supplierDeliveryNo: 'İRS-8842', supplierDeliveryDate: addDaysStr(OPEN_FROM, 24), lines: r1lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', r1.receipt.id, `Mal kabul ${r1.receipt.docNo} kaydedildi (1 satır)`);
  await auditReceiptLots(tx, r1.receipt.docNo, r1.createdLotIds);

  // R2 — Anadolu Kuruyemiş: Badem + Fındık
  const supAnadolu = await partnerByCode(tx, 'S-000005');
  const r2lines = [
    await line('301030000', kg.id, 200, 315, { supplierLotNo: 'AKY-0826-B', expiryDate: addDaysStr(OPEN_FROM, 300) }),
    await line('301040000', kg.id, 150, 275, { supplierLotNo: 'AKY-0826-F', expiryDate: addDaysStr(OPEN_FROM, 300) }),
  ];
  const r2 = await createAndReceive(tx, { warehouseId: tire.id, partnerId: supAnadolu.id, supplierDeliveryNo: 'İRS-3301', supplierDeliveryDate: addDaysStr(OPEN_FROM, 26), lines: r2lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', r2.receipt.id, `Mal kabul ${r2.receipt.docNo} kaydedildi (2 satır)`);
  await auditReceiptLots(tx, r2.receipt.docNo, r2.createdLotIds);

  // R3 — Tatlısu: Suklaroz (tam kabul) + stevya (kısmi red)
  const supTatlisu = await partnerByCode(tx, 'S-000002');
  const r3lines = [
    await line('302010000', kg.id, 80, 690, { supplierLotNo: 'TTM-1140' }),
    await line('302020000', kg.id, 60, 650, { supplierLotNo: 'TTM-1141', rejectedQty: D(8), rejectReason: 'Nem oranı spesifikasyon sınırında — kısmi red' }),
  ];
  const r3 = await createAndReceive(tx, { warehouseId: tire.id, partnerId: supTatlisu.id, supplierDeliveryNo: 'İRS-5567', supplierDeliveryDate: addDaysStr(OPEN_FROM, 27), lines: r3lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', r3.receipt.id, `Mal kabul ${r3.receipt.docNo} kaydedildi (kısmi red içerir)`);
  await auditReceiptLots(tx, r3.receipt.docNo, r3.createdLotIds);

  // R4 — Aromatik Kimya: Vanilya Aroması, karantinada QC bekliyor
  const supAromatik = await partnerByCode(tx, 'S-000003');
  const r4lines = [await line('304010000', kg.id, 40, 910, { supplierLotNo: 'ARK-2290', disposition: 'quarantine', expiryDate: addDaysStr(OPEN_FROM, 700) })];
  const r4 = await createAndReceive(tx, { warehouseId: tire.id, partnerId: supAromatik.id, supplierDeliveryNo: 'İRS-9012', supplierDeliveryDate: addDaysStr(OPEN_FROM, 29), lines: r4lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', r4.receipt.id, `Mal kabul ${r4.receipt.docNo} kaydedildi (karantina)`);
  await auditReceiptLots(tx, r4.receipt.docNo, r4.createdLotIds);
  // requiresIncomingQc=false olduğundan receiveGoods otomatik qc_checks açmadı — karantinadaki lot için gelen QC kaydını
  // gerçek akışla birebir aynı biçimde (receipts.ts'nin yaptığı gibi) elle açıyoruz; doc §19 "biri karantinada QC bekliyor".
  const r4line = r4.lines[0]!;
  if (r4line.lotId) {
    const qcNo = await nextDocNo(tx, 'QC', dateAt(addDaysStr(OPEN_FROM, 29)));
    const [qcRow] = await tx.insert(qcChecks).values({
      docNo: qcNo, kind: 'incoming', productId: r4line.productId, lotId: r4line.lotId, receiptId: r4.receipt.id, receiptLineId: r4line.id,
      supplierId: supAromatik.id, result: 'pending', sampledQty: null, checkedAt: null,
    }).returning();
    await tx.update(receipts).set({ status: 'qc_pending' }).where(eq(receipts.id, r4.receipt.id));
    await auditCreate(tx, 'qc_checks', qcRow!.id, `Gelen kalite kontrolü ${qcNo} açıldı (bekliyor)`);
  }

  // R5 — Ege Ambalaj: kavanoz/kapak/etiket/koli
  const supEge = await partnerByCode(tx, 'S-000004');
  const r5lines = [
    await line('401010000', adet.id, 1000, 22, { supplierLotNo: 'EGA-4471' }),
    await line('401020000', adet.id, 1000, 10, { supplierLotNo: 'EGA-4472' }),
    await line('401030000', adet.id, 2000, 8, { supplierLotNo: 'EGA-4473' }),
    await line('401040000', adet.id, 300, 25, { supplierLotNo: 'EGA-4474' }),
  ];
  const r5 = await createAndReceive(tx, { warehouseId: tire.id, partnerId: supEge.id, supplierDeliveryNo: 'İRS-1180', supplierDeliveryDate: addDaysStr(OPEN_FROM, 30), lines: r5lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', r5.receipt.id, `Mal kabul ${r5.receipt.docNo} kaydedildi (4 satır)`);
  await auditReceiptLots(tx, r5.receipt.docNo, r5.createdLotIds);

  // R6 — Kahve Dünyası: yeşil kahve + matcha
  const supKahve = await partnerByCode(tx, 'S-000006');
  const r6lines = [
    await line('308010000', kg.id, 100, 255, { supplierLotNo: 'KDN-7710', expiryDate: addDaysStr(OPEN_FROM, 540) }),
    await line('308020000', kg.id, 25, 810, { supplierLotNo: 'KDN-7711', expiryDate: addDaysStr(OPEN_FROM, 540) }),
  ];
  const r6 = await createAndReceive(tx, { warehouseId: tire.id, partnerId: supKahve.id, supplierDeliveryNo: 'İRS-6603', supplierDeliveryDate: addDaysStr(OPEN_FROM, 31), lines: r6lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', r6.receipt.id, `Mal kabul ${r6.receipt.docNo} kaydedildi (2 satır)`);
  await auditReceiptLots(tx, r6.receipt.docNo, r6.createdLotIds);

  summary.add('receipts (mal kabul)', 6);
}

/* ==================================================================== */
/* 4) Transferler (3 adet, biri Tire→Buca transit)                      */
/* ==================================================================== */

async function seedTransfers(tx: DbOrTx, summary: SeedSummary, rawPlacements: Placement[], finishedPlacements: Placement[]): Promise<void> {
  const tire = await wh(tx, 'TIRE');
  const buca = await wh(tx, 'BUCA');
  const kg = await uom(tx, 'KG');

  // T1 — aynı depo (TIRE) içi raf transferi: Yulaf'ın B lotu R0x → R0y
  const yulafB = rawPlacements.find((p) => p.sku === '301060000' && p.lotNo.endsWith('-B'));
  if (yulafB) {
    const destShelf = RAW_SHELVES.find((c) => c !== yulafB.locationCode) ?? RAW_SHELVES[0]!;
    const dest = await loc(tx, destShelf);
    const moveQty = Math.min(60, Number(yulafB.qty));
    const { transfer } = await createTransfer(tx, {
      fromWarehouseId: tire.id, toWarehouseId: tire.id, scheduledDate: addDaysStr(OPEN_FROM, 33), reason: 'Raf düzenleme',
      lines: [{ productId: yulafB.productId, lotId: yulafB.lotId, qty: D(moveQty), uomId: kg.id, fromLocationId: yulafB.locationId, toLocationId: dest.id }],
    }, SYSTEM_ACTOR);
    await auditCreate(tx, 'transfers', transfer.id, `Transfer ${transfer.docNo} oluşturuldu`);
    const done1 = await completeTransfer(tx, transfer.id, SYSTEM_ACTOR);
    await auditPost(tx, 'transfers', transfer.id, `Transfer ${transfer.docNo}: tamamlandı (${done1.transfer.status})`);
  }

  // T2 — Tire → Buca (transit'te bırakılır, "Teslim al" henüz yapılmamış)
  const bademBazi = finishedPlacements.find((p) => p.sku === '110010001');
  if (bademBazi) {
    const bucaMamulR01 = await loc(tx, 'BUCA/MAMUL/R01');
    const adet = await uom(tx, 'ADET');
    const moveQty = Math.min(30, Number(bademBazi.qty));
    const { transfer } = await createTransfer(tx, {
      fromWarehouseId: tire.id, toWarehouseId: buca.id, scheduledDate: addDaysStr(OPEN_FROM, 34), reason: 'Buca depo ilk sevkiyatı',
      lines: [{ productId: bademBazi.productId, lotId: bademBazi.lotId, qty: D(moveQty), uomId: adet.id, fromLocationId: bademBazi.locationId, toLocationId: bucaMamulR01.id }],
    }, SYSTEM_ACTOR);
    await auditCreate(tx, 'transfers', transfer.id, `Transfer ${transfer.docNo} oluşturuldu (Tire → Buca)`);
    const done2 = await completeTransfer(tx, transfer.id, SYSTEM_ACTOR); // → in_transit (TIRE/SEVK); receiveTransfer bilerek çağrılmıyor
    await auditPost(tx, 'transfers', transfer.id, `Transfer ${transfer.docNo}: yola çıktı (${done2.transfer.status})`);
  }

  // T3 — aynı depo (TIRE) içi transfer: Badem'in A lotu R0x → R0y (tamamlanmış)
  const bademA = rawPlacements.find((p) => p.sku === '301030000' && p.lotNo.endsWith('-A'));
  if (bademA) {
    const destShelf = RAW_SHELVES.find((c) => c !== bademA.locationCode) ?? RAW_SHELVES[1]!;
    const dest = await loc(tx, destShelf);
    const moveQty = Math.min(20, Number(bademA.qty));
    const { transfer } = await createTransfer(tx, {
      fromWarehouseId: tire.id, toWarehouseId: tire.id, scheduledDate: addDaysStr(OPEN_FROM, 35), reason: 'Konsolidasyon',
      lines: [{ productId: bademA.productId, lotId: bademA.lotId, qty: D(moveQty), uomId: kg.id, fromLocationId: bademA.locationId, toLocationId: dest.id }],
    }, SYSTEM_ACTOR);
    await auditCreate(tx, 'transfers', transfer.id, `Transfer ${transfer.docNo} oluşturuldu`);
    const done3 = await completeTransfer(tx, transfer.id, SYSTEM_ACTOR);
    await auditPost(tx, 'transfers', transfer.id, `Transfer ${transfer.docNo}: tamamlandı (${done3.transfer.status})`);
  }

  summary.add('transfers', 3);
}

/* ==================================================================== */
/* 5) Sayım (1 tamamlanmış, 2 fark satırı)                              */
/* ==================================================================== */

async function seedCount(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const tire = await wh(tx, 'TIRE');
  const scope = await loc(tx, 'TIRE/HAM/R01/A');

  const count = await createCount(tx, { warehouseId: tire.id, scopeLocationId: scope.id, countDate: addDaysStr(OPEN_FROM, 36), note: 'Aylık kısmi sayım — R01/A rafı' }, SYSTEM_ACTOR);
  await auditCreate(tx, 'stock_counts', count.id, `Sayım ${count.docNo} oluşturuldu`);
  const { lines } = await snapshotCount(tx, count.id, SYSTEM_ACTOR);
  if (!lines.length) {
    log('stock', 'UYARI: TIRE/HAM/R01/A rafında sayım için satır bulunamadı — sayım atlanıyor');
    return;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i]!;
    const systemQty = Number(l.systemQty);
    let countedQty = systemQty;
    if (i === 0) countedQty = systemQty + 5; // sayım fazlası
    else if (i === 1 && lines.length > 1) countedQty = Math.max(0, systemQty - 3); // sayım eksiği
    await recordCount(tx, { countId: count.id, lineId: l.id, countedQty: D(countedQty) }, SYSTEM_ACTOR);
  }

  await submitReview(tx, count.id, SYSTEM_ACTOR);
  await approveCount(tx, count.id, SYSTEM_ACTOR); // fark eşiğin (5.000 TL) altında — doğrudan onaylanır
  await postCount(tx, count.id, SYSTEM_ACTOR);
  await auditPost(tx, 'stock_counts', count.id, `Sayım ${count.docNo} kaydedildi`);
  summary.add('stock_counts (tamamlanmış)', 1);
}

/* ==================================================================== */
/* Ana giriş noktası                                                    */
/* ==================================================================== */

export async function seedStock(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const [existing] = await tx.select({ id: stockLots.id }).from(stockLots).limit(1);
  if (existing) {
    log('stock', 'stock_lots dolu — depo seed atlanıyor (idempotent)');
    return;
  }

  const rawProductIds = await tx.select({ id: products.id }).from(products).where(inArray(products.type, ['raw_material', 'packaging']));
  if (rawProductIds.length === 0) throw new Error('seed:stock — hammadde/ambalaj ürünleri bulunamadı; önce masterdata seed çalıştırılmalı');

  log('stock', 'hammadde + ambalaj açılış lotları...');
  const rawPlacements = await seedRawAndPackagingOpening(tx, summary);

  log('stock', 'mamul açılış lotları...');
  const finishedPlacements = await seedFinishedOpening(tx, summary);

  log('stock', 'mal kabul belgeleri...');
  await seedReceipts(tx, summary);

  log('stock', 'transferler...');
  await seedTransfers(tx, summary, rawPlacements, finishedPlacements);

  log('stock', 'sayım...');
  await seedCount(tx, summary);
}

import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { products, warehouses, locations, workOrders, uoms, partners } from '../schema/index.js';
import {
  D, SYSTEM_ACTOR, writeAudit,
  createWorkOrder, releaseWorkOrder, startWorkOrder, pauseWorkOrder, resumeWorkOrder,
  autoConsumeRemaining, recordScrap, finishWorkOrder, closeWorkOrder,
  consumeLot, pickFefo, resolveWarehouseRoot,
  createAndReceive, type ReceiptLineInput,
} from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * `createAndReceive` (`createReceipt` + `receiveGoods` + her satır için `createLot`) kendi audit
 * satırlarını yazmaz (bunu normalde web tarafındaki `withAudit` yapar) — I17 (audit kapsamı) için
 * `seed/stock.ts`'teki `auditCreate`/`auditReceiptLots` deseninin birebir aynısı burada da uygulanır.
 */
async function auditCreate(tx: DbOrTx, tableName: string, recordId: string, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName, recordId, summary }, SYSTEM_ACTOR);
}
async function auditReceiptLots(tx: DbOrTx, docNo: string, createdLotIds: string[]): Promise<void> {
  for (const lotId of createdLotIds) await auditCreate(tx, 'stock_lots', lotId, `Mal kabul ${docNo} ile lot oluşturuldu`);
}

/**
 * Üretim modülü seed'i — docs/modules/uretim.md §Seed.
 * Tüm belgeler yalnızca `@plantero/core` üretim servisleri üzerinden üretilir (createWorkOrder →
 * releaseWorkOrder → startWorkOrder → autoConsumeRemaining (gerçek FEFO tüketim) → [recordScrap] →
 * finishWorkOrder → closeWorkOrder) — elle insert yok. `asOf` parametreleri ile hareketler son 30
 * güne yayılır (Ağustos 2026 mali dönemleri açık — bkz. `seed/accounting.ts` ve `seed/stock.ts`daki
 * OPEN_FROM notu; Ocak–Temmuz kapalı olduğundan tüm tarihler 2026-08-01 sonrasına düşer).
 *
 * 8 iş emri: 4 kapalı (farklı hatlar/ürünler, gerçek FEFO tüketim, 2'sinde fire, verim %94-99),
 * 2 bitmiş ama kapatılmamış, 1 devam eden (kısmi tüketim + duruş olayı), 1 planlanmış (yarın).
 */

async function productBySku(tx: DbOrTx, sku: string) {
  const [row] = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!row) throw new Error(`seed:production — ürün bulunamadı (SKU): ${sku}`);
  return row;
}
async function tireWarehouse(tx: DbOrTx) {
  const [row] = await tx.select().from(warehouses).where(eq(warehouses.code, 'TIRE')).limit(1);
  if (!row) throw new Error('seed:production — TIRE deposu bulunamadı');
  return row;
}
async function uomByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(uoms).where(eq(uoms.code, code)).limit(1);
  if (!row) throw new Error(`seed:production — birim bulunamadı: ${code}`);
  return row;
}
async function firstSupplier(tx: DbOrTx) {
  const [row] = await tx.select().from(partners).where(eq(partners.kind, 'supplier')).limit(1);
  if (!row) throw new Error('seed:production — tedarikçi bulunamadı');
  return row;
}

const at = (isoDay: string, hhmm = '09:00'): Date => new Date(`${isoDay}T${hhmm}:00Z`);
const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * 3_600_000);
const addDaysStr = (base: string, days: number): string => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * İş emirlerinin tükettiği hammadde/ambalaj — 8 reçetenin toplam ihtiyacı üstüne %20-50 pay ile.
 * Bu ürünlerin `depo` seed'inde açılış (origin='opening') lotları zaten var ama I5 kuralı ("her
 * tüketim lotunun origin_receipt_id VEYA origin_work_order_id'si dolu") açılış lotlarını (kaynak
 * belgesiz açılış bakiyesi) kapsamaz. Üretim tüketiminin belge zincirini koparmaması için burada
 * gerçek bir mal kabulle (origin_receipt_id dolu) taze, daha yakın SKT'li lotlar açılır — FEFO bu
 * lotları açılış lotlarından önce seçer, böylece tüketim zinciri her zaman mal kabule kadar izlenir.
 */
const CONSUMED_SUPPLEMENT: Array<{ sku: string; qty: number; unitCost: number; uomCode: 'KG' | 'ADET' }> = [
  { sku: '301030000', qty: 30, unitCost: 320, uomCode: 'KG' }, // Badem
  { sku: '301040000', qty: 25, unitCost: 280, uomCode: 'KG' }, // Fındık
  { sku: '301060000', qty: 60, unitCost: 40, uomCode: 'KG' }, // Yulaf (jar + saşe reçeteleri; saşe reçetesi pack_qty ile ölçeklenir)
  { sku: '302030000', qty: 20, unitCost: 120, uomCode: 'KG' }, // Hurma Şurubu
  { sku: '307020000', qty: 5, unitCost: 15, uomCode: 'KG' }, // Deniz Tuzu
  { sku: '301010000', qty: 60, unitCost: 210, uomCode: 'KG' }, // Isolated Pea Protein
  { sku: '301020000', qty: 25, unitCost: 45, uomCode: 'KG' }, // Nohut Tozu
  { sku: '302010000', qty: 6, unitCost: 700, uomCode: 'KG' }, // Suklaroz
  { sku: '303010000', qty: 4, unitCost: 450, uomCode: 'KG' }, // Guar Gum
  { sku: '303020000', qty: 4, unitCost: 450, uomCode: 'KG' }, // Xhantam Gum
  { sku: '306010000', qty: 8, unitCost: 150, uomCode: 'KG' }, // Inulin
  { sku: '305010000', qty: 3, unitCost: 1200, uomCode: 'KG' }, // b2+b12+e
  { sku: '307010000', qty: 10, unitCost: 260, uomCode: 'KG' }, // Cream (saşe reçetesi pack_qty ile ölçeklenir)
  { sku: '304020000', qty: 3, unitCost: 900, uomCode: 'KG' }, // masker
  { sku: '304050000', qty: 3, unitCost: 900, uomCode: 'KG' }, // Çilek Aroma Verici
  { sku: '308010000', qty: 20, unitCost: 250, uomCode: 'KG' }, // Kahve Çekirdeği
  { sku: '401010000', qty: 300, unitCost: 22, uomCode: 'ADET' }, // Kavanoz 500ml
  { sku: '401020000', qty: 300, unitCost: 10, uomCode: 'ADET' }, // Kapak
  { sku: '401030000', qty: 450, unitCost: 8, uomCode: 'ADET' }, // Etiket
  { sku: '402010000', qty: 150, unitCost: 18, uomCode: 'ADET' }, // Doypack 1kg
  { sku: '402020000', qty: 220, unitCost: 9, uomCode: 'ADET' }, // Saşe 10g
  { sku: '402030000', qty: 50, unitCost: 15, uomCode: 'ADET' }, // Kraft Kahve Torbası 250g
];

async function locationByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(locations).where(eq(locations.code, code)).limit(1);
  if (!row) throw new Error(`seed:production — lokasyon bulunamadı: ${code}`);
  return row;
}

async function seedConsumptionSupplement(tx: DbOrTx, warehouseId: string, summary: SeedSummary): Promise<void> {
  const kg = await uomByCode(tx, 'KG');
  const adet = await uomByCode(tx, 'ADET');
  const supplier = await firstSupplier(tx);
  // Hedef lokasyon açıkça verilir: `TIRE/HAM` kökü toplanabilir (isPickable) değildir — varsayılan
  // koyma çözümü (resolveDefaultPutawayLocation) HAM'ın doğrudan alt rafları (R01/R02/R03) da
  // toplanabilir olmadığından kökte kalır ve FEFO'ya (yalnızca isPickable lokasyonlar) hiç girmez.
  const hamShelf = await locationByCode(tx, 'TIRE/HAM/R01/A');
  const ambShelf = await locationByCode(tx, 'TIRE/AMB');
  const lines: ReceiptLineInput[] = [];
  for (const s of CONSUMED_SUPPLEMENT) {
    const product = await productBySku(tx, s.sku);
    lines.push({
      productId: product.id, qty: D(s.qty), uomId: s.uomCode === 'KG' ? kg.id : adet.id, unitCost: D(s.unitCost),
      supplierLotNo: `SEED-URT-${s.sku}`, expiryDate: addDaysStr(TODAY, 10), disposition: 'released',
      toLocationId: s.uomCode === 'KG' ? hamShelf.id : ambShelf.id,
    });
  }
  const { receipt, createdLotIds } = await createAndReceive(tx, { warehouseId, partnerId: supplier.id, supplierDeliveryNo: 'SEED-URT-TEDARIK', origin: 'manual', note: 'Seed: üretim iş emirleri için hammadde/ambalaj takviyesi (FEFO önceliği açılış lotlarından önce)', lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', receipt.id, `Mal kabul ${receipt.docNo} kaydedildi (üretim takviyesi, ${lines.length} satır)`);
  await auditReceiptLots(tx, receipt.docNo, createdLotIds);
  summary.add('receipts (üretim hammadde takviyesi)', 1);
  log('production', `hammadde/ambalaj takviyesi alındı: ${receipt.docNo} (${lines.length} satır)`);
}

type ClosedDef = { sku: string; plannedQty: number; producedQty: number; day: string; withScrap: boolean };

/** 4 kapalı iş emri — farklı hatlar/ürünler (BOM'un varsayılan hattına göre HAT1/HAT2/HAT3'e dağılır) */
const CLOSED_RUNS: ClosedDef[] = [
  { sku: '110010001', plannedQty: 100, producedQty: 98, day: addDaysStr(TODAY, -28), withScrap: false }, // BADEM BAZI — HAT1
  { sku: '140040001', plannedQty: 60, producedQty: 57, day: addDaysStr(TODAY, -21), withScrap: true }, // %100 Oat Spredable — HAT1
  { sku: '130010001', plannedQty: 50, producedQty: 47, day: addDaysStr(TODAY, -14), withScrap: true }, // Plain Protein Mixi — HAT2
  { sku: '150040001', plannedQty: 200, producedQty: 196, day: addDaysStr(TODAY, -7), withScrap: false }, // Oat Coffee Creamer — HAT3
];

/** 2 bitmiş ama kapatılmamış iş emri */
const FINISHED_RUNS: Array<{ sku: string; plannedQty: number; producedQty: number; day: string }> = [
  { sku: '110020001', plannedQty: 80, producedQty: 76, day: addDaysStr(TODAY, -3) }, // FINDIK BAZI — HAT1
  { sku: '160010001', plannedQty: 40, producedQty: 39, day: TODAY }, // Plantero Guatemala Kahve — HAT2
];

async function runClosedWorkOrder(tx: DbOrTx, def: ClosedDef, warehouseId: string, summary: SeedSummary): Promise<void> {
  const product = await productBySku(tx, def.sku);
  const startedAt = at(def.day, '08:00');

  const { workOrder } = await createWorkOrder(tx, { productId: product.id, plannedQty: D(def.plannedQty), warehouseId, plannedStart: startedAt, origin: 'manual', note: 'Seed: geçmiş üretim koşusu' }, SYSTEM_ACTOR);
  await releaseWorkOrder(tx, workOrder.id, SYSTEM_ACTOR);
  await startWorkOrder(tx, workOrder.id, SYSTEM_ACTOR, { asOf: startedAt });
  await autoConsumeRemaining(tx, workOrder.id, SYSTEM_ACTOR, { asOf: addHours(startedAt, 1) });

  if (def.withScrap) {
    await recordScrap(tx, { workOrderId: workOrder.id, qty: D(def.plannedQty * 0.01), reason: 'startup', stage: 'proses', note: 'Seed: hat ayarı sırasında başlangıç firesi', asOf: addHours(startedAt, 2) }, SYSTEM_ACTOR);
  }

  const finishedAt = addHours(startedAt, 4);
  await finishWorkOrder(tx, { workOrderId: workOrder.id, producedQty: D(def.producedQty), asOf: finishedAt }, SYSTEM_ACTOR);
  await closeWorkOrder(tx, workOrder.id, SYSTEM_ACTOR, { asOf: addHours(finishedAt, 1) });
  summary.add(`work_orders (kapalı: ${product.name})`, 1);
}

async function runFinishedWorkOrder(tx: DbOrTx, def: { sku: string; plannedQty: number; producedQty: number; day: string }, warehouseId: string, summary: SeedSummary): Promise<void> {
  const product = await productBySku(tx, def.sku);
  const startedAt = at(def.day, '08:30');

  const { workOrder } = await createWorkOrder(tx, { productId: product.id, plannedQty: D(def.plannedQty), warehouseId, plannedStart: startedAt, origin: 'manual', note: 'Seed: bitmiş, kapatılmayı bekliyor' }, SYSTEM_ACTOR);
  await releaseWorkOrder(tx, workOrder.id, SYSTEM_ACTOR);
  await startWorkOrder(tx, workOrder.id, SYSTEM_ACTOR, { asOf: startedAt });
  await autoConsumeRemaining(tx, workOrder.id, SYSTEM_ACTOR, { asOf: addHours(startedAt, 1) });
  await finishWorkOrder(tx, { workOrderId: workOrder.id, producedQty: D(def.producedQty), asOf: addHours(startedAt, 3) }, SYSTEM_ACTOR);
  summary.add(`work_orders (bitmiş, açık: ${product.name})`, 1);
}

/** 1 devam eden iş emri: kısmi tüketim + duruş (mola) olayı, in_progress durumunda kalır */
async function runInProgressWorkOrder(tx: DbOrTx, warehouseId: string, summary: SeedSummary): Promise<void> {
  const product = await productBySku(tx, '130010201'); // Strawberry Protein Mixi — HAT2
  // `at(TODAY, '07:30')` UTC 07:30 üretir — İstanbul'da 10:30. Seed günün herhangi bir saatinde
  // çalıştırılabildiğinden (ör. 10:30 İstanbul'dan önce), bu sabit saat gerçek "şimdi"den ileride
  // kalabiliyordu: operatör terminalinde SÜRE karosu çalışan bir kronometre yerine donmuş 00:00:00
  // gösteriyordu (Tur 3 bulgusu, P2). Gerçek "şimdi"ye göre göreli bir geçmiş saat kullanılır — bu
  // iş emri her koşulda gerçekten başlamış görünür.
  const startedAt = addHours(new Date(), -4);

  const { workOrder, materials } = await createWorkOrder(tx, { productId: product.id, plannedQty: D(70), warehouseId, plannedStart: startedAt, origin: 'manual', note: 'Seed: devam eden parti' }, SYSTEM_ACTOR);
  await releaseWorkOrder(tx, workOrder.id, SYSTEM_ACTOR);
  await startWorkOrder(tx, workOrder.id, SYSTEM_ACTOR, { asOf: startedAt });

  // Kısmi tüketim: reçetenin yalnızca ~%40'ı — ilk malzemeyi manuel FEFO ile kısmi tüket
  const firstMaterial = materials.find((m) => !m.isByproduct);
  if (firstMaterial) {
    const root = await resolveWarehouseRoot(tx, warehouseId, 'raw_material');
    const partialQty = D(firstMaterial.plannedQty).mul(0.4);
    const [pick] = await pickFefo(tx, { productId: firstMaterial.productId, qty: partialQty, rootLocationId: root.id, allowStatuses: ['released'], allowPartial: true });
    if (pick?.lotId) {
      await consumeLot(tx, { workOrderId: workOrder.id, lotId: pick.lotId, qty: pick.qty, asOf: addHours(startedAt, 1) }, SYSTEM_ACTOR);
    }
  }

  // Duruş olayı: mola için duraklat → devam et (work_order_events + downtimes kaydı)
  await pauseWorkOrder(tx, workOrder.id, { reason: 'break', note: 'Seed: öğle molası', asOf: addHours(startedAt, 2) }, SYSTEM_ACTOR);
  await resumeWorkOrder(tx, workOrder.id, SYSTEM_ACTOR, { asOf: addHours(startedAt, 2.5) });

  summary.add('work_orders (devam eden)', 1);
}

/** 1 planlanmış iş emri: yarın için, henüz serbest bırakılmadı */
async function runPlannedWorkOrder(tx: DbOrTx, warehouseId: string, summary: SeedSummary): Promise<void> {
  const product = await productBySku(tx, '110030001'); // KAJU BAZI — HAT1
  const plannedStart = at(addDaysStr(TODAY, 1), '08:00');
  const { workOrder } = await createWorkOrder(tx, { productId: product.id, plannedQty: D(90), warehouseId, plannedStart, origin: 'manual', note: 'Seed: yarın planlandı' }, SYSTEM_ACTOR);
  summary.add('work_orders (planlanmış)', 1);
  if (workOrder.status !== 'planned') throw new Error('seed:production — planlanmış iş emri beklenmedik durumda');
}

export async function seedProduction(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const [existing] = await tx.select({ id: workOrders.id }).from(workOrders).limit(1);
  if (existing) {
    log('production', 'iş emirleri zaten var — atlanıyor (idempotent)');
    return;
  }

  log('production', 'iş emirleri (kapalı/bitmiş/devam eden/planlanmış)...');
  const tire = await tireWarehouse(tx);

  await seedConsumptionSupplement(tx, tire.id, summary);

  for (const def of CLOSED_RUNS) await runClosedWorkOrder(tx, def, tire.id, summary);
  for (const def of FINISHED_RUNS) await runFinishedWorkOrder(tx, def, tire.id, summary);
  await runInProgressWorkOrder(tx, tire.id, summary);
  await runPlannedWorkOrder(tx, tire.id, summary);
}

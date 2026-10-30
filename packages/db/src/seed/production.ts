import { and, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { products, warehouses, locations, workOrders, partners, boms, bomLines } from '../schema/index.js';
import {
  D, SYSTEM_ACTOR, writeAudit, ZERO,
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
/** İki ISO gün (YYYY-MM-DD) arasında erken olanı */
const earlierDay = (a: string, b: string): string => (a < b ? a : b);

/**
 * İş emirlerinin tükettiği hammadde/ambalaj — çok seviyeli aktif reçetelerden (mamul → yarı mamul → hammadde)
 * türetilen toplam ihtiyacın üstüne %35 pay + 1 birim ile. Liste artık sabit değil: `seed/uretim-bom.ts`
 * gerçek Üretim Excel'inden reçeteleri kurduğu için ihtiyaç aktif BOM'lar açılarak hesaplanır.
 * Bu ürünlerin `depo` seed'inde açılış (origin='opening') lotları olabilir ama I5 kuralı ("her tüketim
 * lotunun origin_receipt_id VEYA origin_work_order_id'si dolu") açılış lotlarını (kaynak belgesiz açılış
 * bakiyesi) kapsamaz. Üretim tüketiminin belge zincirini koparmaması için burada gerçek bir mal kabulle
 * (origin_receipt_id dolu) taze, daha yakın SKT'li lotlar açılır — FEFO bu lotları açılış lotlarından önce
 * seçer, böylece tüketim zinciri her zaman mal kabule kadar izlenir. Yeni (Excel'den gelen) SKU'ların
 * başka stoğu yoktur; ihtiyaçları yalnızca bu takviyeyle karşılanır.
 */
const LEGACY_UNIT_COST: Record<string, number> = {
  '301030000': 320, '301040000': 280, '301060000': 40, '302030000': 120, '307020000': 15, '301010000': 210, '301020000': 45,
  '302010000': 700, '303010000': 450, '303020000': 450, '306010000': 150, '305010000': 1200, '307010000': 260, '304020000': 900,
  '304050000': 900, '308010000': 250, '401010000': 22, '401020000': 10, '401030000': 8, '402010000': 18, '402020000': 9, '402030000': 15,
};

/** Bir ürünün aktif reçetesi (en yüksek versiyon) */
async function activeBomOf(tx: DbOrTx, productId: string) {
  const [bom] = await tx.select().from(boms).where(and(eq(boms.productId, productId), eq(boms.status, 'active'))).orderBy(desc(boms.version)).limit(1);
  return bom ?? null;
}

/**
 * Aktif reçeteyi yarı mamullere kadar açar; yaprak (hammadde/ambalaj) ihtiyaçlarını biriktirir.
 * Yarı mamul bileşenleri kendi aktif reçetesiyle açılır (bileşen miktarı / reçete çıktısı oranında).
 */
async function collectLeafRequirements(tx: DbOrTx, productId: string, qty: ReturnType<typeof D>, acc: Map<string, ReturnType<typeof D>>, depth = 0): Promise<void> {
  if (depth > 6) throw new Error('seed:production — reçete derinliği 6\'yı aştı (döngü?)');
  const bom = await activeBomOf(tx, productId);
  if (!bom) {
    acc.set(productId, (acc.get(productId) ?? ZERO).plus(qty));
    return;
  }
  const lines = await tx.select({ line: bomLines, type: products.type }).from(bomLines).innerJoin(products, eq(products.id, bomLines.productId)).where(eq(bomLines.bomId, bom.id));
  for (const { line, type } of lines) {
    if (line.isByproduct) continue;
    const need = D(line.qty).mul(qty).div(D(bom.outputQty)).mul(D(1).plus(D(line.scrapPct).div(100)));
    if (type === 'semi_finished') await collectLeafRequirements(tx, line.productId, need, acc, depth + 1);
    else acc.set(line.productId, (acc.get(line.productId) ?? ZERO).plus(need));
  }
}

async function locationByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(locations).where(eq(locations.code, code)).limit(1);
  if (!row) throw new Error(`seed:production — lokasyon bulunamadı: ${code}`);
  return row;
}

async function seedConsumptionSupplement(tx: DbOrTx, warehouseId: string, requirements: Map<string, ReturnType<typeof D>>, summary: SeedSummary): Promise<void> {
  const supplier = await firstSupplier(tx);
  // Hedef lokasyon açıkça verilir: `TIRE/HAM` kökü toplanabilir (isPickable) değildir — varsayılan
  // koyma çözümü (resolveDefaultPutawayLocation) HAM'ın doğrudan alt rafları (R01/R02/R03) da
  // toplanabilir olmadığından kökte kalır ve FEFO'ya (yalnızca isPickable lokasyonlar) hiç girmez.
  const hamShelf = await locationByCode(tx, 'TIRE/HAM/R01/A');
  const ambShelf = await locationByCode(tx, 'TIRE/AMB');
  const lines: ReceiptLineInput[] = [];
  const entries = [...requirements.entries()];
  const rows = await Promise.all(entries.map(async ([productId, need]) => {
    const [p] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    return { p: p!, need };
  }));
  rows.sort((a, b) => a.p.sku.localeCompare(b.p.sku));
  for (const { p, need } of rows) {
    if (p.type !== 'raw_material' && p.type !== 'packaging') continue;
    const isKg = p.type === 'raw_material';
    const qty = D(need).mul(1.35).plus(1).ceil();
    const std = D(p.standardCost);
    const unitCost = std.gt(0) ? std : D(LEGACY_UNIT_COST[p.sku] ?? (isKg ? 100 : 5));
    lines.push({
      productId: p.id, qty, uomId: p.uomId, unitCost,
      supplierLotNo: `SEED-URT-${p.sku}`, expiryDate: addDaysStr(TODAY, 10), disposition: 'released',
      toLocationId: isKg ? hamShelf.id : ambShelf.id,
    });
  }
  const { receipt, createdLotIds } = await createAndReceive(tx, { warehouseId, partnerId: supplier.id, supplierDeliveryNo: 'SEED-URT-TEDARIK', origin: 'manual', note: 'Seed: üretim iş emirleri için hammadde/ambalaj takviyesi (çok seviyeli reçete ihtiyacı; FEFO önceliği açılış lotlarından önce)', lines }, SYSTEM_ACTOR);
  await auditCreate(tx, 'receipts', receipt.id, `Mal kabul ${receipt.docNo} kaydedildi (üretim takviyesi, ${lines.length} satır)`);
  await auditReceiptLots(tx, receipt.docNo, createdLotIds);
  summary.add('receipts (üretim hammadde takviyesi)', 1);
  log('production', `hammadde/ambalaj takviyesi alındı: ${receipt.docNo} (${lines.length} satır)`);
}

/**
 * Çok seviyeli reçete: mamul iş emrinden ÖNCE, aktif reçetesindeki her yarı mamul için kapalı bir yarı mamul
 * iş emri (gerçek FEFO tüketim → yarı mamul lotu) çalıştırılır. Böylece mamul tüketimi yarı mamul lotundan,
 * yarı mamul lotu da hammadde mal kabulüne kadar (origin_work_order_id → tüketim → mal kabul) izlenebilir.
 */
async function runSemiFinishedPrerequisites(tx: DbOrTx, mamulSku: string, mamulQty: number, day: string, warehouseId: string, summary: SeedSummary): Promise<void> {
  const mamul = await productBySku(tx, mamulSku);
  const bom = await activeBomOf(tx, mamul.id);
  if (!bom) return;
  const lines = await tx.select({ line: bomLines, p: products }).from(bomLines).innerJoin(products, eq(products.id, bomLines.productId)).where(eq(bomLines.bomId, bom.id));
  for (const { line, p } of lines) {
    if (p.type !== 'semi_finished') continue;
    const need = D(line.qty).mul(mamulQty).div(D(bom.outputQty));
    // Yarı mamul partisi mamulün ihtiyacının üstünde üretilir (%25 emniyet payı): yarı mamul depoda ortak ara
    // stok olarak kalır; sonradan açılan yeni mamul iş emirleri (ör. e2e zinciri: Oat Coffee Creamer × 20 =
    // 200 yarı mamul) kendi yarı mamul partisini beklemeden mevcut lottan tüketebilir.
    const plannedQty = need.mul(1.3).ceil();
    const producedQty = need.mul(1.25).ceil();
    const ymDay = addDaysStr(day, -1);
    const startedAt = at(ymDay, '07:30');
    const { workOrder } = await createWorkOrder(tx, { productId: p.id, plannedQty, warehouseId, plannedStart: startedAt, origin: 'manual', note: `Seed: ${mamul.name} için yarı mamul baz partisi` }, SYSTEM_ACTOR);
    await releaseWorkOrder(tx, workOrder.id, SYSTEM_ACTOR);
    await startWorkOrder(tx, workOrder.id, SYSTEM_ACTOR, { asOf: startedAt });
    await autoConsumeRemaining(tx, workOrder.id, SYSTEM_ACTOR, { asOf: addHours(startedAt, 1) });
    const finishedAt = addHours(startedAt, 4);
    await finishWorkOrder(tx, { workOrderId: workOrder.id, producedQty, asOf: finishedAt }, SYSTEM_ACTOR);
    await closeWorkOrder(tx, workOrder.id, SYSTEM_ACTOR, { asOf: addHours(finishedAt, 1) });
    summary.add(`work_orders (yarı mamul, kapalı: ${p.name})`, 1);
  }
}

type ClosedDef = { sku: string; plannedQty: number; producedQty: number; day: string; withScrap: boolean };

/** 4 kapalı iş emri — farklı hatlar/ürünler (BOM'un varsayılan hattına göre HAT1/HAT2/HAT3'e dağılır) */
const CLOSED_RUNS: ClosedDef[] = [
  { sku: '110010001', plannedQty: 100, producedQty: 98, day: addDaysStr(TODAY, -28), withScrap: false }, // BADEM BAZI — HAT1
  { sku: '140040001', plannedQty: 60, producedQty: 57, day: addDaysStr(TODAY, -21), withScrap: true }, // %100 Oat Spredable — HAT1
  { sku: '130010001', plannedQty: 50, producedQty: 47, day: addDaysStr(TODAY, -14), withScrap: true }, // Plain Protein Mixi — HAT2
  // Oat Coffee Creamer — HAT3. Gün, saatten bağımsız olarak AÇILIŞ lotlarından (SKT 2027-08-15) ÖNCE sona eren
  // bir SKT üretsin diye en geç 2026-08-03 günüyle sınırlanır (lot SKT'si = üretim günü + 365): FEFO sevkiyatları
  // (sales seed: Migros / Trendyol / Hepsiburada siparişleri) bu üretim lotundan çıkar, lot KISMEN sevk
  // edilmiş ve eldeki stoğu kalmış olur (izlenebilirlik: iş emri → yarı mamul lotu → hammadde ← → sevkiyat → müşteri).
  // Bugüne göre göreli gün (-7) saat ilerledikçe SKT'yi açılış lotlarının ardına itiyor, hiçbir üretim lotu hiç
  // sevk edilmiyordu.
  { sku: '150040001', plannedQty: 200, producedQty: 196, day: earlierDay(addDaysStr(TODAY, -7), '2026-08-03'), withScrap: false },
];

/** 2 bitmiş ama kapatılmamış iş emri */
const FINISHED_RUNS: Array<{ sku: string; plannedQty: number; producedQty: number; day: string }> = [
  { sku: '110020001', plannedQty: 80, producedQty: 76, day: addDaysStr(TODAY, -3) }, // FINDIK BAZI — HAT1
  { sku: '160010001', plannedQty: 40, producedQty: 39, day: TODAY }, // Plantero Guatemala Kahve — HAT2
];

async function runClosedWorkOrder(tx: DbOrTx, def: ClosedDef, warehouseId: string, summary: SeedSummary): Promise<void> {
  const product = await productBySku(tx, def.sku);
  await runSemiFinishedPrerequisites(tx, def.sku, def.plannedQty, def.day, warehouseId, summary);
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
  await runSemiFinishedPrerequisites(tx, def.sku, def.plannedQty, def.day, warehouseId, summary);
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
  await runSemiFinishedPrerequisites(tx, '130010201', 70, TODAY, warehouseId, summary);
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

  // Toplam hammadde/ambalaj ihtiyacı: tüketim yapan (planlanmış hariç) iş emirlerinin aktif reçeteleri yarı mamullere
  // kadar açılır. Yarı mamul partileri mamul ihtiyacından %10 fazla planlandığı için takviye payı bunu da kapsar.
  const requirements = new Map<string, ReturnType<typeof D>>();
  for (const def of [...CLOSED_RUNS, ...FINISHED_RUNS]) await collectLeafRequirements(tx, (await productBySku(tx, def.sku)).id, D(def.plannedQty).mul(1.1), requirements);
  await collectLeafRequirements(tx, (await productBySku(tx, '130010201')).id, D(70).mul(1.1), requirements); // devam eden: Strawberry Protein Mixi
  await seedConsumptionSupplement(tx, tire.id, requirements, summary);

  for (const def of CLOSED_RUNS) await runClosedWorkOrder(tx, def, tire.id, summary);
  for (const def of FINISHED_RUNS) await runFinishedWorkOrder(tx, def, tire.id, summary);
  await runInProgressWorkOrder(tx, tire.id, summary);
  await runPlannedWorkOrder(tx, tire.id, summary);
}

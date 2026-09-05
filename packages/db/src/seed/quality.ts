import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { locations, warehouses, uoms, partners, products, stockLots, deliveryLines, deliveries, qcChecks } from '../schema/index.js';
import { D, SYSTEM_ACTOR, writeAudit, createAndReceive, type ReceiptLineInput } from '@plantero/core';
import { createIncomingCheck, recordResults, decide } from '@plantero/core/quality/checks';
import { createTemplate } from '@plantero/core/quality/templates';
import { computeSupplierScores } from '@plantero/core/quality/supplierScore';
import { simulate as simulateRecall } from '@plantero/core/quality/recall';
import { updateProduct } from '@plantero/core/masterdata/products';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Kalite & İzlenebilirlik modülü seed'i — docs/modules/kalite.md §Seed.
 * Tüm yazımlar `@plantero/core` servisleri üzerindendir (elle insert yok — sözleşme #10).
 *
 * Dönem kısıtı `stock.ts` ile AYNI: yalnızca Ağustos 2026 ve sonrası mali dönemi açık (`accounting.ts`
 * seed'i), bu yüzden değerli hareket üreten her mal kabul `OPEN_FROM`dan sonra tarihlenir.
 *
 * `requiresIncomingQc` bayrağı mevcut hiçbir ürüne Excel importundan gelmiyor (hepsi `false`) — bu
 * yüzden yeni QC kontrolleri, mal kabulün OTOMATİK açtığı yola değil, `quality/checks.ts`nin KENDİ
 * `createIncomingCheck`ine (ürün bayrağından bağımsız, manuel/ek kontrol için tasarlanmış — bkz. o
 * dosyanın başlık yorumu) güvenir; lotlar yine `disposition:'quarantine'` ile normal karantina akışına
 * girer, yalnızca otomatik `qc_checks` açılışı bu üründe tetiklenmediği için burada açıkça açılır.
 * Mevcut R4 (Vanilya, `stock.ts`) zaten 1 bekleyen kayıt bırakmıştı — o + burada bırakılan 1 bekleyen
 * = doc kabulündeki "2 bekliyor".
 */

const OPEN_FROM = '2026-08-01';
const addDaysStr = (base: string, days: number): string => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function wh(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(warehouses).where(eq(warehouses.code, code)).limit(1);
  if (!row) throw new Error(`seed:quality — depo bulunamadı: ${code}`);
  return row;
}
async function uom(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(uoms).where(eq(uoms.code, code)).limit(1);
  if (!row) throw new Error(`seed:quality — birim bulunamadı: ${code}`);
  return row;
}
async function partnerByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(partners).where(eq(partners.code, code)).limit(1);
  if (!row) throw new Error(`seed:quality — cari bulunamadı: ${code}`);
  return row;
}
async function productBySku(tx: DbOrTx, sku: string) {
  const [row] = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!row) throw new Error(`seed:quality — ürün bulunamadı (SKU): ${sku}`);
  return row;
}
async function locByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(locations).where(eq(locations.code, code)).limit(1);
  if (!row) throw new Error(`seed:quality — lokasyon bulunamadı: ${code}`);
  return row;
}

type Decision = 'pass' | 'pending' | 'fail';

async function receiveAndCheck(
  tx: DbOrTx,
  opts: { sku: string; supplierCode: string; qty: number; unitCost: number; supplierLotNo: string; day: number; templateId: string; decision: Decision },
): Promise<{ checkId: string; lotId: string }> {
  const tire = await wh(tx, 'TIRE');
  const kg = await uom(tx, 'KG');
  const supplier = await partnerByCode(tx, opts.supplierCode);
  const product = await productBySku(tx, opts.sku);

  const lines: ReceiptLineInput[] = [{
    productId: product.id, qty: D(opts.qty), uomId: kg.id, unitCost: D(opts.unitCost),
    supplierLotNo: opts.supplierLotNo, expiryDate: addDaysStr(OPEN_FROM, 420), disposition: 'quarantine',
  }];
  const { receipt, lines: createdLines, createdLotIds } = await createAndReceive(tx, {
    warehouseId: tire.id, partnerId: supplier.id, supplierDeliveryNo: `İRS-QC-${opts.supplierLotNo}`, supplierDeliveryDate: addDaysStr(OPEN_FROM, opts.day), lines,
  }, SYSTEM_ACTOR);
  const line = createdLines[0]!;
  const lotId = createdLotIds[0]!;

  // `createAndReceive` (createReceipt/receiveGoods/createLot) kendi audit satırını yazmaz — I17
  // (audit kapsamı) `stock.ts`teki AYNI kalıbı burada da gerektirir (bkz. o dosyanın başlık yorumu).
  await writeAudit(tx, { action: 'create', tableName: 'receipts', recordId: receipt.id, summary: `Mal kabul ${receipt.docNo} kaydedildi (kalite kontrol seed'i)`, after: receipt }, SYSTEM_ACTOR);
  for (const id of createdLotIds) {
    await writeAudit(tx, { action: 'create', tableName: 'stock_lots', recordId: id, summary: `Mal kabul ${receipt.docNo} ile lot oluşturuldu` }, SYSTEM_ACTOR);
  }

  const check = await createIncomingCheck(tx, {
    productId: product.id, lotId, receiptId: receipt.id, receiptLineId: line.id, supplierId: supplier.id, templateId: opts.templateId, kind: 'incoming',
  }, SYSTEM_ACTOR);

  if (opts.decision === 'pending') return { checkId: check.id, lotId };

  const pass = opts.decision === 'pass';
  await recordResults(tx, check.id, [
    { name: 'Nem %', kind: 'numeric', valueNumeric: pass ? D(6.5) : D(14.2) },
    { name: 'Koku', kind: 'boolean', valueBool: true },
    { name: 'Ambalaj bütünlüğü', kind: 'boolean', valueBool: pass },
    { name: 'Sertifika', kind: 'text', valueText: pass ? 'CoA-2026-0142' : '' },
  ], SYSTEM_ACTOR);

  if (pass) {
    const target = await locByCode(tx, 'TIRE/HAM/R01/A');
    await decide(tx, check.id, { decision: 'released', releaseToLocationId: target.id, note: 'Kontrol kalemleri şablon sınırları içinde' }, SYSTEM_ACTOR);
  } else {
    const red = await locByCode(tx, 'TIRE/RED');
    await decide(tx, check.id, { decision: 'rejected', rejectToLocationId: red.id, returnToSupplier: true, note: 'Nem oranı ve ambalaj bütünlüğü spesifikasyon dışı' }, SYSTEM_ACTOR);
  }
  return { checkId: check.id, lotId };
}

export async function seedQuality(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  /* -------------------------------------------------------------- */
  /* 1) QC şablonları                                                 */
  /* -------------------------------------------------------------- */
  const genelHam = await createTemplate(tx, {
    code: 'GENEL-HAM', name: 'Hammadde Genel Girdi Kontrolü', productType: 'raw_material', isActive: true,
    items: [
      { name: 'Nem %', kind: 'numeric', minValue: '0', maxValue: '9', unit: '%', isCritical: true },
      { name: 'Koku', kind: 'boolean', isCritical: false },
      { name: 'Ambalaj bütünlüğü', kind: 'boolean', isCritical: true },
      { name: 'Sertifika', kind: 'text', isCritical: false },
    ],
  }, SYSTEM_ACTOR);
  const kuruyemis = await createTemplate(tx, {
    code: 'KURUYEMIS', name: 'Kuruyemiş Girdi Kontrolü', productType: 'raw_material', isActive: true,
    items: [
      { name: 'Nem %', kind: 'numeric', minValue: '0', maxValue: '8', unit: '%', isCritical: true },
      { name: 'Koku', kind: 'boolean', isCritical: false },
      { name: 'Ambalaj bütünlüğü', kind: 'boolean', isCritical: true },
      { name: 'Sertifika', kind: 'text', isCritical: false },
      { name: 'Aflatoksin belgesi', kind: 'document', isCritical: true },
    ],
  }, SYSTEM_ACTOR);
  log('quality', `şablonlar: ${genelHam.code}, ${kuruyemis.code}`);
  summary.add('qc_templates', 2);

  /* -------------------------------------------------------------- */
  /* 2) 7 yeni kontrol (5 geçti, 1 bekliyor, 1 kaldı) + stock.ts'teki */
  /*    R4 (Vanilya) zaten 1 bekleyen bırakmıştı → toplam 8, 2 bekliyor */
  /* -------------------------------------------------------------- */
  const runs: Array<Parameters<typeof receiveAndCheck>[1]> = [
    { sku: '301010000', supplierCode: 'S-000001', qty: 15, unitCost: 210, supplierLotNo: 'PSN-QC-01', day: 33, templateId: genelHam.id, decision: 'pass' },
    { sku: '302010000', supplierCode: 'S-000002', qty: 20, unitCost: 690, supplierLotNo: 'TTM-QC-01', day: 34, templateId: genelHam.id, decision: 'pass' },
    { sku: '302020000', supplierCode: 'S-000002', qty: 10, unitCost: 650, supplierLotNo: 'TTM-QC-02', day: 34, templateId: genelHam.id, decision: 'pass' },
    { sku: '304010000', supplierCode: 'S-000003', qty: 12, unitCost: 910, supplierLotNo: 'ARK-QC-01', day: 35, templateId: genelHam.id, decision: 'pass' },
    { sku: '308010000', supplierCode: 'S-000006', qty: 18, unitCost: 255, supplierLotNo: 'KDN-QC-01', day: 36, templateId: genelHam.id, decision: 'pass' },
    { sku: '301030000', supplierCode: 'S-000005', qty: 25, unitCost: 315, supplierLotNo: 'AKY-QC-01', day: 37, templateId: kuruyemis.id, decision: 'pending' },
    { sku: '301040000', supplierCode: 'S-000005', qty: 14, unitCost: 275, supplierLotNo: 'AKY-QC-02', day: 37, templateId: kuruyemis.id, decision: 'fail' },
  ];
  let passed = 0, pending = 0, failed = 0;
  for (const run of runs) {
    await receiveAndCheck(tx, run);
    if (run.decision === 'pass') passed++;
    else if (run.decision === 'pending') pending++;
    else failed++;
  }
  log('quality', `kalite kontrolleri: ${passed} geçti, ${pending + 1} bekliyor (+1 mevcut R4 Vanilya), ${failed} kaldı`);
  summary.add('qc_checks (yeni)', runs.length);

  /* -------------------------------------------------------------- */
  /* 3) Tedarikçi kalite skoru — 3 ay                                 */
  /* -------------------------------------------------------------- */
  const now = new Date();
  const periods: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  let scoreRows = 0;
  for (const period of periods) {
    const rows = await computeSupplierScores(tx, period, SYSTEM_ACTOR);
    scoreRows += rows.length;
  }
  log('quality', `tedarikçi kalite skoru: ${periods.join(', ')} — ${scoreRows} satır`);
  summary.add('supplier_scores', scoreRows);

  /* -------------------------------------------------------------- */
  /* 4) 1 geri çağırma simülasyonu — üretimde tüketilmiş + sevk edilmiş */
  /*    bir mamul lotu (hem geri hem ileri zincir dolu olsun diye)      */
  /* -------------------------------------------------------------- */
  const [rootLotRow] = await tx
    .select({ lotId: stockLots.id })
    .from(deliveryLines)
    .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
    .innerJoin(stockLots, eq(stockLots.id, deliveryLines.lotId))
    .where(and(isNotNull(deliveryLines.lotId), eq(stockLots.origin, 'production')))
    .orderBy(desc(deliveries.createdAt))
    .limit(1);

  if (rootLotRow) {
    const { recall } = await simulateRecall(tx, {
      rootLotId: rootLotRow.lotId, direction: 'both',
      reason: 'Rutin izlenebilirlik tatbikatı — müşteri şikayeti simülasyonu (yabancı madde şüphesi)',
    }, SYSTEM_ACTOR);
    log('quality', `geri çağırma simülasyonu: ${recall.docNo}`);
    summary.add('recalls (simülasyon)', 1);
  } else {
    log('quality', 'UYARI: geri çağırma simülasyonu için uygun (sevk edilmiş mamul) lot bulunamadı — atlandı');
  }
}

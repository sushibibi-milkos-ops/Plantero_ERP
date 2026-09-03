import { eq, inArray } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  workOrders, workOrderConsumptions, workOrderOutputs, workOrderScraps, workOrderEvents,
  boms, products, productionLines, stockLots, stockMoves, type DbOrTx,
} from '@plantero/db';
import { D, toDb, round4, sum, ZERO, isZero4 } from '../money.js';
import { nextLotNo } from '../sequences.js';
import { indexDocument } from '../documents/chain.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { postStockMove, createLot } from '../stock/ledger.js';
import { getScrapLocation } from '../stock/locations.js';
import { postJournalEntry } from '../accounting/journal.js';
import { autoConsumeRemaining } from './consume.js';
import { computeYieldPct } from './yield.js';
import type { ActorCtx } from '../types.js';

/**
 * İş emri bitirme/kapama — mamul çıktı, fire ve maliyet kilidi.
 * Maliyet kuralı (ARCHITECTURE §6): materialCost = Σ consumptions.value, overheadCost = bom.overheadPerBatch +
 * bom.overheadPerUnit × producedQty, totalCost = material + overhead, unitCost = total / producedQty (4 hane).
 */

export type ScrapReason = 'spill' | 'burnt' | 'contamination' | 'packaging' | 'startup' | 'other';
export type ScrapStage = 'hammadde' | 'proses' | 'ambalaj';

async function loadActive(tx: DbOrTx, workOrderId: string, lock = false) {
  const q = tx.select().from(workOrders).where(eq(workOrders.id, workOrderId));
  const [wo] = lock ? await q.for('update') : await q.limit(1);
  if (!wo) throw new NotFoundError('İş emri', workOrderId);
  return wo;
}

/**
 * İş emrinin mamul lotunu getirir, yoksa oluşturur (`work_orders.outputLotId`'ye kalıcı olarak
 * bağlanır). Fire (bitirmeden önce de olabilir) ve bitirme çıktısı AYNI batch lotuna yazılır —
 * lot takipli mamulde fire de bir lot gerektirir (ledger kuralı); parti kimliği üretim başladığı
 * andan itibaren tektir. Birim maliyet, `postStockMove(kind:'production')` ilk gerçek girişte
 * ağırlıklı ortalamayla belirlenir (bu noktada eldeki 0 olduğundan doğrudan hesaplanan maliyet olur).
 */
async function ensureOutputLot(
  tx: DbOrTx, wo: typeof workOrders.$inferSelect, product: typeof products.$inferSelect, ctx: ActorCtx, estimatedUnitCost: Decimal = ZERO, asOf?: Date,
): Promise<{ lotId: string | null; lot: typeof stockLots.$inferSelect | null }> {
  if (!product.isLotTracked) return { lotId: null, lot: null };
  if (wo.outputLotId) {
    const [existing] = await tx.select().from(stockLots).where(eq(stockLots.id, wo.outputLotId)).limit(1);
    if (existing) return { lotId: existing.id, lot: existing };
  }
  const [line] = await tx.select().from(productionLines).where(eq(productionLines.id, wo.lineId)).limit(1);
  if (!line) throw new NotFoundError('Üretim hattı', wo.lineId);
  const movedAt = asOf ?? new Date();
  const lotNo = await nextLotNo(tx, line.code, movedAt);
  // Parti henüz fiilen stoklanmadığı (quant yok) için maliyet burada yalnızca fire değerlemesi için ara
  // tahmindir — `postStockMove(kind:'production')` bitirme anında gerçek birim maliyeti kesinleştirir.
  const lot = await createLot(tx, {
    productId: product.id, lotNo, origin: 'production', unitCost: estimatedUnitCost, productionDate: movedAt,
    originWorkOrderId: wo.id, note: `İş emri ${wo.docNo} çıktısı`,
  }, ctx);
  await tx.update(workOrders).set({ outputLotId: lot.id }).where(eq(workOrders.id, wo.id));
  await writeAudit(tx, { action: 'create', tableName: 'stock_lots', recordId: lot.id, summary: `Mamul lotu ${lotNo} oluşturuldu (İş emri ${wo.docNo})`, after: lot }, ctx);
  return { lotId: lot.id, lot };
}

/**
 * Fire kaydı (operatör "Fire gir"): iş emrinin kendi ürünü, hattın üretim (sanal, WIP) lokasyonundan
 * hurdaya — `postStockMove(kind:'scrap')` `from.usage='production'` olduğunda ledger otomatik olarak
 * WIP yönünü uygular (659 / 151.01, quant değişmez). Birim maliyet: o ana kadarki ortalama tüketim
 * maliyeti (materialCost / tüketilen miktar); henüz tüketim yoksa reçete malzeme maliyeti tahmini.
 */
export async function recordScrap(tx: DbOrTx, input: { workOrderId: string; qty: Decimal; reason: ScrapReason; stage: ScrapStage; note?: string | null; asOf?: Date }, ctx: ActorCtx): Promise<typeof workOrderScraps.$inferSelect> {
  const wo = await loadActive(tx, input.workOrderId, true);
  if (!['in_progress', 'paused'].includes(wo.status)) throw new DomainError('WO_NOT_ACTIVE', `İş emri ${wo.docNo} fire kabul etmiyor (durum: ${wo.status})`, { status: wo.status });
  const qty = round4(D(input.qty));
  if (qty.lte(0)) throw new ValidationError('Fire miktarı sıfırdan büyük olmalı');
  const movedAt = input.asOf ?? new Date();

  const [line] = await tx.select().from(productionLines).where(eq(productionLines.id, wo.lineId)).limit(1);
  if (!line) throw new NotFoundError('Üretim hattı', wo.lineId);
  const [product] = await tx.select().from(products).where(eq(products.id, wo.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', wo.productId);
  const scrapLoc = await getScrapLocation(tx, wo.warehouseId);

  const consumedQty = sum((await tx.select({ qty: workOrderConsumptions.qty }).from(workOrderConsumptions).where(eq(workOrderConsumptions.workOrderId, wo.id))).map((r) => r.qty));
  const unitCost = consumedQty.gt(0) ? round4(D(wo.materialCost).div(consumedQty)) : ZERO;
  const { lotId } = await ensureOutputLot(tx, wo, product, ctx, unitCost, movedAt);

  const res = await postStockMove(tx, {
    kind: 'scrap', productId: wo.productId, lotId, fromLocationId: line.locationId, toLocationId: scrapLoc.id,
    qty, uomId: wo.uomId, unitCost, refType: 'work_order', refId: wo.id, refNo: wo.docNo, origin: wo.origin, note: input.note ?? `Fire: ${input.reason} (${input.stage})`, movedAt,
  }, ctx);

  const [row] = await tx
    .insert(workOrderScraps)
    .values({ workOrderId: wo.id, productId: wo.productId, qty: toDb(qty), uomId: wo.uomId, reason: input.reason, stage: input.stage, unitCost: toDb(res.unitCost), value: toDb(res.value), stockMoveId: res.moveId, recordedBy: ctx.userId ?? null, note: input.note ?? null, recordedAt: movedAt })
    .returning();

  await tx.update(workOrders).set({ scrapQty: toDb(D(wo.scrapQty).plus(qty)), updatedBy: ctx.userId ?? null }).where(eq(workOrders.id, wo.id));
  await tx.insert(workOrderEvents).values({ workOrderId: wo.id, kind: 'scrap', userId: ctx.userId ?? null, at: movedAt, payload: { qty: toDb(qty), reason: input.reason, stage: input.stage } });
  await writeAudit(tx, { action: 'post', tableName: 'work_order_scraps', recordId: row!.id, summary: `İş emri ${wo.docNo}: ${toDb(qty)} ${wo.uomId} fire (${input.reason})`, after: row }, ctx);

  return row!;
}

export type FinishWorkOrderInput = {
  workOrderId: string;
  producedQty: Decimal;
  /** true ise bitirmeden önce reçetedeki tüketilmemiş kalan malzemeyi FEFO ile otomatik tüketir */
  autoConsumeRemainingMaterials?: boolean;
  /** Seed/geçmiş veri simülasyonu için hareket tarihi (verilmezse şimdi) */
  asOf?: Date;
};

/**
 * İş emrini bitirir: (opsiyonel) kalan malzemeyi otomatik tüketir → genel gider payını hesaplar →
 * mamul lotu oluşturur (`createLot`, `originWorkOrderId` dolu) → `postStockMove(kind:'production')`
 * (hat → mamul rafı) → `work_order_outputs` satırı → verim % → durum `finished`.
 */
export async function finishWorkOrder(tx: DbOrTx, input: FinishWorkOrderInput, ctx: ActorCtx): Promise<{ workOrder: typeof workOrders.$inferSelect; output: typeof workOrderOutputs.$inferSelect; lot: typeof stockLots.$inferSelect | null }> {
  const wo = await loadActive(tx, input.workOrderId, true);
  if (!['in_progress', 'paused'].includes(wo.status)) throw new DomainError('WO_NOT_ACTIVE', `İş emri ${wo.docNo} bitirilemez (durum: ${wo.status})`, { status: wo.status });
  const producedQty = round4(D(input.producedQty));
  if (producedQty.lte(0)) throw new ValidationError('Üretilen miktar sıfırdan büyük olmalı');

  if (input.autoConsumeRemainingMaterials) await autoConsumeRemaining(tx, wo.id, ctx, { asOf: input.asOf });

  const [bom] = await tx.select().from(boms).where(eq(boms.id, wo.bomId)).limit(1);
  if (!bom) throw new NotFoundError('Reçete', wo.bomId);
  const [product] = await tx.select().from(products).where(eq(products.id, wo.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', wo.productId);
  const [line] = await tx.select().from(productionLines).where(eq(productionLines.id, wo.lineId)).limit(1);
  if (!line) throw new NotFoundError('Üretim hattı', wo.lineId);

  // materialCost işlemler boyunca wo.materialCost'ta biriktirilir (bkz. consume.ts) — burada tekrar okunur
  const [freshWo] = await tx.select().from(workOrders).where(eq(workOrders.id, wo.id)).limit(1);
  const materialCost = D(freshWo!.materialCost);
  const overheadCost = round4(D(bom.overheadPerBatch).plus(D(bom.overheadPerUnit).mul(producedQty)));
  const totalCost = round4(materialCost.plus(overheadCost));
  const unitCost = round4(totalCost.div(producedQty));

  const movedAt = input.asOf ?? new Date();
  const { lotId, lot: reusedLot } = await ensureOutputLot(tx, wo, product, ctx, unitCost, movedAt);
  let lot = reusedLot;

  const res = await postStockMove(tx, {
    kind: 'production', productId: product.id, lotId, fromLocationId: line.locationId, toLocationId: wo.destLocationId,
    qty: producedQty, uomId: wo.uomId, unitCost, overheadValue: overheadCost, refType: 'work_order', refId: wo.id, refNo: wo.docNo,
    origin: wo.origin, movedAt,
  }, ctx);
  if (lotId) {
    const [refreshed] = await tx.select().from(stockLots).where(eq(stockLots.id, lotId)).limit(1);
    lot = refreshed ?? lot;
  }

  const [output] = await tx
    .insert(workOrderOutputs)
    .values({ workOrderId: wo.id, productId: product.id, lotId: lotId ?? (await ensurePlaceholderLot(tx, product.id)), toLocationId: wo.destLocationId, qty: toDb(producedQty), uomId: wo.uomId, isByproduct: false, costSharePct: '100', unitCost: toDb(res.unitCost), value: toDb(res.value), stockMoveId: res.moveId, producedAt: movedAt })
    .returning();

  const newProducedQty = round4(D(wo.producedQty).plus(producedQty));
  const yieldPct = computeYieldPct(D(wo.plannedQty), newProducedQty);

  const [updated] = await tx
    .update(workOrders)
    .set({
      status: 'finished', producedQty: toDb(newProducedQty), outputLotId: wo.outputLotId ?? lotId, finishedAt: wo.finishedAt ?? movedAt,
      overheadCost: toDb(overheadCost), totalCost: toDb(totalCost), unitCost: toDb(unitCost), yieldPct: toDb(yieldPct), updatedBy: ctx.userId ?? null,
    })
    .where(eq(workOrders.id, wo.id))
    .returning();

  await tx.insert(workOrderEvents).values({ workOrderId: wo.id, kind: 'output', userId: ctx.userId ?? null, payload: { qty: toDb(producedQty), lotId, unitCost: toDb(res.unitCost) } });
  await tx.insert(workOrderEvents).values({ workOrderId: wo.id, kind: 'finish', userId: ctx.userId ?? null, at: movedAt });
  await indexDocument(tx, { type: 'work_order', recordId: wo.id, docNo: wo.docNo, status: 'finished', origin: wo.origin, title: `İş Emri ${wo.docNo}`, amount: totalCost, docDate: movedAt });
  await writeAudit(tx, { action: 'post', tableName: 'work_orders', recordId: wo.id, summary: `İş emri ${wo.docNo} bitti: ${toDb(producedQty)} ${product.name} (verim %${toDb(yieldPct)})`, before: { status: wo.status }, after: { status: 'finished', producedQty: toDb(newProducedQty), totalCost: toDb(totalCost) } }, ctx);

  return { workOrder: updated!, output: output!, lot };
}

/** Lot takipsiz mamul (nadiren) — work_order_outputs.lotId NOT NULL olduğundan sembolik bir lot açılır. */
async function ensurePlaceholderLot(tx: DbOrTx, productId: string): Promise<string> {
  const lot = await createLot(tx, { productId, lotNo: `NOLOT-${Date.now()}`, origin: 'production', status: 'released' });
  return lot.id;
}

/**
 * İş emrini kapatır (yalnızca `finished`):
 * 1. 4 hane yuvarlama farkını son çıktı satırına düzeltir (I14 c/d).
 * 2. 151.01 WIP hesabındaki bu iş emrine ait kalan bakiyeyi sıfırlar (ARCHITECTURE §6, I15 notu:
 *    "kapalı iş emirleri 151.01'e net sıfır bırakır"). Kalan = materialCost − Σ(output malzeme payı)
 *    − Σ fire değeri (I15 formülüyle birebir); bu genellikle fire değeri kadar negatiftir çünkü
 *    `finishWorkOrder` çıktı maliyetini tam materialCost+overhead üzerinden hesaplar (fire ayrıca
 *    659'a düşmüştür — aynı tutar iki kez WIP'ten düşmüş olur) — kapanışta 151.01/659 arasında
 *    düzeltme fişiyle telafi edilir. Fiziksel WIP staging olmadığından (tüketim doğrudan lokasyondan
 *    hattın sanal üretim lokasyonuna yazılır — bkz. `consume.ts`) kapanışta geri iade edilecek fiziksel
 *    stok yoktur; tüketilmeyen planlanan malzeme yalnızca raporlama farkıdır.
 */
export async function closeWorkOrder(tx: DbOrTx, workOrderId: string, ctx: ActorCtx, opts: { asOf?: Date } = {}): Promise<typeof workOrders.$inferSelect> {
  const wo = await loadActive(tx, workOrderId, true);
  if (wo.status !== 'finished') throw new DomainError('WO_NOT_FINISHED', `İş emri ${wo.docNo} önce bitirilmeli (durum: ${wo.status})`, { status: wo.status });
  const closedAt = opts.asOf ?? new Date();

  // I14(c)/(d) uzlaştırması: work_order_outputs satırlarına DOKUNULMAZ (her satır zaten kendi içinde
  // qty × unitCost = value ile tam tutarlıdır — postStockMove'un ürettiği doğal değer). Bunun yerine
  // Σ outputs.value ile (material_cost + overhead_cost) arasındaki 4 hane yuvarlama farkı overhead_cost'a
  // eklenir; total_cost bu YENİ overhead_cost'tan yeniden türetilir. Böylece (a) total=material+overhead
  // (yapı gereği), (c) Σoutputs.value=total_cost (yapı gereği) VE (d) her satırın kendi iç tutarlılığı
  // (dokunulmadığı için) aynı anda sağlanır — output satırını value=total_cost'a zorlamak (d)'yi bozardı.
  const outputs = await tx.select().from(workOrderOutputs).where(eq(workOrderOutputs.workOrderId, workOrderId));
  if (outputs.length) {
    const sumValue = sum(outputs.map((o) => o.value));
    const diff = round4(sumValue.minus(D(wo.materialCost).plus(D(wo.overheadCost))));
    if (!diff.isZero()) {
      const newOverheadCost = round4(D(wo.overheadCost).plus(diff));
      const newTotalCost = round4(D(wo.materialCost).plus(newOverheadCost));
      await tx.update(workOrders).set({ overheadCost: toDb(newOverheadCost), totalCost: toDb(newTotalCost) }).where(eq(workOrders.id, workOrderId));
      wo.overheadCost = toDb(newOverheadCost);
      wo.totalCost = toDb(newTotalCost);
    }
  }

  const finalOutputs = outputs;
  const moveIds = finalOutputs.map((o) => o.stockMoveId).filter((id): id is string => Boolean(id));
  const moves = moveIds.length ? await tx.select({ id: stockMoves.id, overheadValue: stockMoves.overheadValue }).from(stockMoves).where(inArray(stockMoves.id, moveIds)) : [];
  const overheadByMove = new Map(moves.map((m) => [m.id, D(m.overheadValue)]));
  const outputMaterialValue = sum(finalOutputs.map((o) => D(o.value).minus(overheadByMove.get(o.stockMoveId ?? '') ?? ZERO)));
  const scrapValue = sum((await tx.select({ value: workOrderScraps.value }).from(workOrderScraps).where(eq(workOrderScraps.workOrderId, workOrderId))).map((s) => s.value));
  const wipResidual = round4(D(wo.materialCost).minus(outputMaterialValue).minus(scrapValue));

  if (!isZero4(wipResidual)) {
    const abs = wipResidual.abs();
    await postJournalEntry(tx, {
      ledger: 'both', journalCode: 'URT', entryDate: closedAt, description: `İş emri ${wo.docNo} kapanış WIP düzeltmesi`,
      refType: 'work_order', refId: wo.id, refNo: wo.docNo, origin: wo.origin,
      lines: [
        // residual > 0: 151.01'de bu iş emrine ait fazla borç bakiyesi var → alacak yazıp sıfırla (659 borç: yazılan zarar)
        // residual < 0: 151.01 fazla alacaklı (fire zaten 659'a yazılmıştı, çıktı maliyeti de aynı tutarı düşmüştü — mükerrer) → 151.01 borç, 659 alacak (fazla masrafı geri al)
        { accountCode: '151.01', debit: wipResidual.lt(0) ? abs : undefined, credit: wipResidual.gt(0) ? abs : undefined, description: `${wo.docNo} WIP kapanış düzeltmesi` },
        { accountCode: '659', debit: wipResidual.gt(0) ? abs : undefined, credit: wipResidual.lt(0) ? abs : undefined, description: `${wo.docNo} WIP kapanış düzeltmesi` },
      ],
    }, ctx);
  }

  const [updated] = await tx.update(workOrders).set({ status: 'closed', closedAt, updatedBy: ctx.userId ?? null }).where(eq(workOrders.id, workOrderId)).returning();
  await tx.insert(workOrderEvents).values({ workOrderId, kind: 'note', userId: ctx.userId ?? null, at: closedAt, payload: { transition: 'closed', wipResidual: toDb(wipResidual) } });
  await indexDocument(tx, { type: 'work_order', recordId: workOrderId, docNo: wo.docNo, status: 'closed', origin: wo.origin, title: `İş Emri ${wo.docNo}`, amount: wo.totalCost });
  await writeAudit(tx, { action: 'approve', tableName: 'work_orders', recordId: workOrderId, summary: `İş emri ${wo.docNo} kapatıldı (maliyet kilitlendi: ${wo.totalCost})`, before: { status: 'finished' }, after: { status: 'closed' } }, ctx);
  return updated!;
}

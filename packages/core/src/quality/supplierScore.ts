import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { partners, receipts, receiptLines, qcChecks, supplierScores, type DbOrTx } from '@plantero/db';
import { D, toDb, ZERO, sum } from '../money.js';
import { writeAudit } from '../audit/index.js';
import { ValidationError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * Tedarikçi kalite skoru — aylık (`/kalite/tedarikci-skoru`, docs kabul: kalite %50, zamanında
 * teslimat %30, miktar doğruluğu %20). `period` = "YYYY-MM". Sonuç `supplier_scores`e upsert
 * edilir ve o dönemin skoru `partners.supplierQualityScore`e yazılır (en güncel çağrı kazanır —
 * çağıran periyotları kronolojik sırayla vermelidir).
 */

const monthRange = (period: string): { start: string; endExclusive: string } => {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new ValidationError('Geçersiz dönem (YYYY-MM bekleniyor)', { period });
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = `${period}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const endExclusive = endDate.toISOString().slice(0, 10);
  return { start, endExclusive };
};

export type SupplierScoreRow = typeof supplierScores.$inferSelect & { partnerName: string };

export async function computeSupplierScores(tx: DbOrTx, period: string, ctx: ActorCtx): Promise<SupplierScoreRow[]> {
  const { start, endExclusive } = monthRange(period);

  const suppliers = await tx.select({ id: partners.id, name: partners.name }).from(partners).where(inArray(partners.kind, ['supplier', 'both']));
  const out: SupplierScoreRow[] = [];

  for (const supplier of suppliers) {
    const supplierReceipts = await tx
      .select({ id: receipts.id, wasOnTime: receipts.wasOnTime, receivedAt: receipts.receivedAt })
      .from(receipts)
      .where(and(eq(receipts.partnerId, supplier.id), eq(receipts.status, 'done'), gte(receipts.receivedAt, new Date(`${start}T00:00:00Z`)), lt(receipts.receivedAt, new Date(`${endExclusive}T00:00:00Z`))));

    const receiptsCount = supplierReceipts.length;
    if (receiptsCount === 0) continue; // bu dönem hiç teslimatı olmayan tedarikçi için skor üretilmez

    const onTimeReceipts = supplierReceipts.filter((r) => r.wasOnTime === true).length;

    const receiptIds = supplierReceipts.map((r) => r.id);
    const lines = await tx.select({ qty: receiptLines.qty, rejectedQty: receiptLines.rejectedQty }).from(receiptLines).where(inArray(receiptLines.receiptId, receiptIds));
    const receivedQty = sum(lines.map((l) => l.qty));
    const rejectedQty = sum(lines.map((l) => l.rejectedQty));

    const checks = await tx
      .select({ id: qcChecks.id, result: qcChecks.result })
      .from(qcChecks)
      .where(and(eq(qcChecks.supplierId, supplier.id), inArray(qcChecks.receiptId, receiptIds)));
    const decided = checks.filter((c) => c.result !== 'pending');
    const passed = decided.filter((c) => c.result === 'passed' || c.result === 'waived');

    const qualityRate = decided.length > 0 ? D(passed.length).div(decided.length) : D(1); // QC gerektirmeyen tedarikçi tam puan
    const onTimeRate = receiptsCount > 0 ? D(onTimeReceipts).div(receiptsCount) : D(1);
    const qtyAccuracy = receivedQty.gt(0) ? D(1).minus(rejectedQty.div(receivedQty)) : D(1);
    const qtyAccuracyClamped = qtyAccuracy.lt(0) ? ZERO : qtyAccuracy;

    const score = qualityRate.mul(50).plus(onTimeRate.mul(30)).plus(qtyAccuracyClamped.mul(20));

    const [row] = await tx
      .insert(supplierScores)
      .values({
        partnerId: supplier.id, period, receipts: receiptsCount, onTimeReceipts, qcChecks: decided.length, qcPassed: passed.length,
        rejectedQty: toDb(rejectedQty), receivedQty: toDb(receivedQty), score: toDb(score), computedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [supplierScores.partnerId, supplierScores.period],
        set: { receipts: receiptsCount, onTimeReceipts, qcChecks: decided.length, qcPassed: passed.length, rejectedQty: toDb(rejectedQty), receivedQty: toDb(receivedQty), score: toDb(score), computedAt: new Date() },
      })
      .returning();

    await tx.update(partners).set({ supplierQualityScore: toDb(score), updatedBy: ctx.userId ?? null }).where(eq(partners.id, supplier.id));

    out.push({ ...row!, partnerName: supplier.name });
  }

  await writeAudit(tx, {
    action: 'other', tableName: 'supplier_scores', recordId: null,
    summary: `Tedarikçi kalite skoru hesaplandı — ${period} (${out.length} tedarikçi)`,
    after: { period, suppliers: out.map((o) => ({ partnerId: o.partnerId, score: o.score })) },
  }, ctx);

  return out;
}

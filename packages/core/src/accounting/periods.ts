import { asc, eq } from 'drizzle-orm';
import { fiscalPeriods, type DbOrTx } from '@plantero/db';
import { writeAudit } from '../audit/index.js';
import { NotFoundError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * Mali dönem kapatma/açma — `docs/modules/muhasebe.md` `/muhasebe/donemler`. `fiscal_periods.is_closed`i
 * yazan TEK servis; `postJournalEntry` (ARCHITECTURE §6/§7) kapalı bir döneme fiş atılmasını zaten
 * reddeder (`PERIOD_CLOSED`) — bu dosya yalnızca durumu değiştirir + audit izi bırakır.
 */

export type FiscalPeriodRow = typeof fiscalPeriods.$inferSelect;

/** Tüm mali dönemleri kronolojik sırayla döner (`/muhasebe/donemler` listesi) */
export async function listPeriods(tx: DbOrTx): Promise<FiscalPeriodRow[]> {
  return tx.select().from(fiscalPeriods).orderBy(asc(fiscalPeriods.code));
}

async function getPeriodOrThrow(tx: DbOrTx, code: string): Promise<FiscalPeriodRow> {
  const [row] = await tx.select().from(fiscalPeriods).where(eq(fiscalPeriods.code, code)).limit(1);
  if (!row) throw new NotFoundError('Mali dönem', code);
  return row;
}

/** Dönemi kapatır. Zaten kapalıysa no-op (idempotent) döner. */
export async function closePeriod(tx: DbOrTx, code: string, ctx: ActorCtx): Promise<FiscalPeriodRow> {
  const period = await getPeriodOrThrow(tx, code);
  if (period.isClosed) return period;

  const [updated] = await tx
    .update(fiscalPeriods)
    .set({ isClosed: true, closedAt: new Date(), closedBy: ctx.userId ?? null })
    .where(eq(fiscalPeriods.id, period.id))
    .returning();

  await writeAudit(tx, {
    action: 'update', tableName: 'fiscal_periods', recordId: period.id,
    summary: `${period.code} dönemi kapatıldı`, before: { isClosed: false }, after: { isClosed: true },
  }, ctx);
  return updated!;
}

/** Dönemi yeniden açar (yanlışlıkla kapatılmış bir dönemi düzeltmek için — kısıtlama yok, çağıran katman yetkilendirir). */
export async function openPeriod(tx: DbOrTx, code: string, ctx: ActorCtx): Promise<FiscalPeriodRow> {
  const period = await getPeriodOrThrow(tx, code);
  if (!period.isClosed) return period;

  const [updated] = await tx
    .update(fiscalPeriods)
    .set({ isClosed: false, closedAt: null, closedBy: null })
    .where(eq(fiscalPeriods.id, period.id))
    .returning();

  await writeAudit(tx, {
    action: 'update', tableName: 'fiscal_periods', recordId: period.id,
    summary: `${period.code} dönemi yeniden açıldı`, before: { isClosed: true }, after: { isClosed: false },
  }, ctx);
  return updated!;
}

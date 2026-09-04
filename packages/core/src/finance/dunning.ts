import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { dunningActions, dunningRules, invoices, partners, approvals, type DbOrTx } from '@plantero/db';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import { businessDate } from '../dates.js';
import type { ActorCtx } from '../types.js';

/**
 * Kademeli tahsilat hatırlatma — `/finans/tahsilat-takibi`.
 *
 * Codebase kuralı (bkz. `packages/core/src/accounting/einvoice.ts` başlık yorumu):
 * `packages/core` HİÇBİR entegrasyon paketini (`@plantero/ai`, `@plantero/integrations`) import
 * ETMEZ (workspace bağımlılığı `packages/core/package.json`da tanımlı değil, dondurulmuş kapsam
 * dışı). Bu yüzden bu dosya AI taslak üretimini (`draftDunningMessage`) ve gerçek gönderimi
 * (`email.sendEmail`/`whatsapp.sendWhatsApp`) ÇAĞIRMAZ — bunlar web katmanında
 * (`apps/web/src/modules/finance/actions.ts`) yapılır, tıpkı `apps/worker/src/jobs/
 * dunningScheduler.ts`nin kendi AI çağrısını yapıp DB'ye kendisinin yazması gibi. Bu dosya üç saf
 * DB fonksiyonu sağlar: `findDueInvoices` (vadesi geçmiş faturalar + seviye), `createDunningDraft`
 * (AI/şablon metnini `dunning_actions`e + gerekiyorsa `approvals` kuyruğuna yazar) ve
 * `recordDunningSendResult` (gerçek gönderim SONUCUNU işler — `applyEInvoiceResult` ile aynı örüntü).
 */

export type DunningLevel = 1 | 2 | 3 | 4;
export type DunningActionStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'failed' | 'cancelled';

/** Vade gününe göre seviye — `apps/worker/src/jobs/dunningScheduler.ts` ile birebir aynı kural */
export function levelForDaysOverdue(daysOverdue: number): DunningLevel {
  if (daysOverdue >= 30) return 4;
  if (daysOverdue >= 15) return 3;
  if (daysOverdue >= 3) return 2;
  return 1;
}

export type DueInvoiceRow = {
  id: string; docNo: string; partnerId: string; partnerName: string; partnerEmail: string | null; partnerWhatsapp: string | null;
  grandTotal: string; residual: string; dueDate: string; currency: string; daysOverdue: number; level: DunningLevel; dunningLevel: number; lastDunningAt: Date | null;
};

/** Vadesi geçmiş, bakiyesi olan satış faturaları (opsiyonel: yalnızca `partnerId`) + hesaplanan seviye */
export async function findDueInvoices(tx: DbOrTx, opts: { asOf?: Date | string; partnerId?: string; windowDays?: number } = {}): Promise<DueInvoiceRow[]> {
  const todayIso = businessDate(opts.asOf ?? new Date());
  const windowStart = businessDate(new Date(new Date(`${todayIso}T00:00:00Z`).getTime() - (opts.windowDays ?? 400) * 86_400_000));

  const conds = [eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid']), lt(invoices.dueDate, todayIso), gte(invoices.dueDate, windowStart)];
  if (opts.partnerId) conds.push(eq(invoices.partnerId, opts.partnerId));

  const rows = await tx
    .select({
      id: invoices.id, docNo: invoices.docNo, partnerId: invoices.partnerId, partnerName: partners.name, partnerEmail: partners.email, partnerWhatsapp: partners.whatsapp,
      grandTotal: invoices.grandTotal, residual: invoices.residual, dueDate: invoices.dueDate, currency: invoices.currency,
      dunningLevel: invoices.dunningLevel, lastDunningAt: invoices.lastDunningAt,
    })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(and(...conds))
    .orderBy(invoices.dueDate);

  return rows
    .filter((r) => Number(r.residual) > 0)
    .map((r) => {
      const daysOverdue = Math.floor((new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(r.dueDate).getTime()) / 86_400_000);
      return { ...r, daysOverdue, level: levelForDaysOverdue(daysOverdue) };
    });
}

export type CreateDunningDraftInput = {
  invoiceId: string; partnerId: string; level: DunningLevel; channel: 'email' | 'whatsapp';
  subject: string | null; body: string; aiGenerated: boolean;
};

/** Bir seviye için zaten taslak/gönderilmiş bir eylem var mı (aynı fatura+seviye tekrar taslaklanmaz) */
export async function hasDunningActionForLevel(tx: DbOrTx, invoiceId: string, level: number): Promise<boolean> {
  const [row] = await tx.select({ id: dunningActions.id }).from(dunningActions).where(and(eq(dunningActions.invoiceId, invoiceId), eq(dunningActions.level, level))).limit(1);
  return !!row;
}

/**
 * AI (veya şablon fallback — çağıran belirler) taslağını `dunning_actions`e yazar. Kuralın
 * `requiresApproval=false` demediği her seviye `pending_approval` durumuna düşer ve `approvals`
 * kuyruğuna (`kind='dunning_message'`) bir satır açılır — CLAUDE.md kural 6 (onay + audit).
 */
export async function createDunningDraft(tx: DbOrTx, input: CreateDunningDraftInput, ctx: ActorCtx): Promise<typeof dunningActions.$inferSelect> {
  const [rule] = await tx.select().from(dunningRules).where(eq(dunningRules.level, input.level)).limit(1);
  const requiresApproval = rule?.requiresApproval ?? true;
  const status = requiresApproval ? 'pending_approval' : 'approved';

  const [action] = await tx
    .insert(dunningActions)
    .values({
      invoiceId: input.invoiceId, partnerId: input.partnerId, ruleId: rule?.id ?? null, level: input.level, channel: input.channel,
      status, subject: input.subject, body: input.body, aiGenerated: input.aiGenerated,
    })
    .returning();
  if (!action) throw new ValidationError('Hatırlatma taslağı oluşturulamadı');

  if (requiresApproval) {
    const [approval] = await tx
      .insert(approvals)
      .values({
        kind: 'dunning_message', refTable: 'dunning_actions', refId: action.id,
        title: `Tahsilat hatırlatması onayı — seviye ${input.level}`,
        summary: input.subject ?? input.body.slice(0, 140),
        confidence: input.aiGenerated ? '0.8' : null,
        requestedBy: ctx.userId,
      })
      .returning({ id: approvals.id });
    if (approval) {
      await tx.update(dunningActions).set({ approvalId: approval.id }).where(eq(dunningActions.id, action.id));
      action.approvalId = approval.id; // dönen nesne güncel kalsın — aşağıdaki `return action` bu satırdan sonra çalışır
    }
  }

  await writeAudit(tx, {
    action: 'create', tableName: 'dunning_actions', recordId: action.id,
    summary: `Fatura hatırlatma taslağı oluşturuldu (seviye ${input.level}, ${input.channel})`, after: action,
  }, ctx);

  return action;
}

/** Onaylanmamış bir taslağı onaylar (gönderim ayrı adımda `recordDunningSendResult` ile işlenir) */
export async function approveDunningDraft(tx: DbOrTx, dunningActionId: string, ctx: ActorCtx): Promise<typeof dunningActions.$inferSelect> {
  const [action] = await tx.select().from(dunningActions).where(eq(dunningActions.id, dunningActionId)).limit(1);
  if (!action) throw new NotFoundError('Hatırlatma taslağı', dunningActionId);
  if (action.status === 'sent') return action;
  if (action.status !== 'draft' && action.status !== 'pending_approval') throw new ValidationError(`${action.status} durumundaki taslak onaylanamaz`);

  const [updated] = await tx.update(dunningActions).set({ status: 'approved', approvedBy: ctx.userId }).where(eq(dunningActions.id, dunningActionId)).returning();
  if (action.approvalId) await tx.update(approvals).set({ status: 'approved', decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(approvals.id, action.approvalId));

  await writeAudit(tx, { action: 'approve', tableName: 'dunning_actions', recordId: dunningActionId, summary: 'Hatırlatma taslağı onaylandı' }, ctx);
  return updated!;
}

export type RecordDunningSendResultInput = { ok: boolean; sentTo: string; error?: string | null };

/**
 * Gerçek gönderim (email/WhatsApp, web katmanında `@plantero/integrations` ile yapılır) SONUCUNU
 * işler — `applyEInvoiceResult` ile aynı örüntü. Başarıda `invoices.dunningLevel++` +
 * `lastDunningAt` günceller (docs kabul kriteri).
 */
export async function recordDunningSendResult(tx: DbOrTx, dunningActionId: string, result: RecordDunningSendResultInput, ctx: ActorCtx): Promise<typeof dunningActions.$inferSelect> {
  const [action] = await tx.select().from(dunningActions).where(eq(dunningActions.id, dunningActionId)).limit(1);
  if (!action) throw new NotFoundError('Hatırlatma taslağı', dunningActionId);

  const [updated] = await tx
    .update(dunningActions)
    .set({ status: result.ok ? 'sent' : 'failed', sentAt: result.ok ? new Date() : action.sentAt, sentTo: result.sentTo, error: result.error ?? null, approvedBy: action.approvedBy ?? ctx.userId })
    .where(eq(dunningActions.id, dunningActionId))
    .returning();

  if (action.approvalId) {
    await tx.update(approvals).set({ status: result.ok ? 'approved' : 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: result.ok ? 'Gönderildi' : (result.error ?? 'Gönderim başarısız') }).where(eq(approvals.id, action.approvalId));
  }

  if (result.ok) {
    const [invoice] = await tx.select({ dunningLevel: invoices.dunningLevel }).from(invoices).where(eq(invoices.id, action.invoiceId)).limit(1);
    await tx.update(invoices).set({ dunningLevel: (invoice?.dunningLevel ?? 0) + 1, lastDunningAt: new Date() }).where(eq(invoices.id, action.invoiceId));
  }

  await writeAudit(tx, {
    action: 'other', tableName: 'dunning_actions', recordId: dunningActionId,
    summary: result.ok ? `Hatırlatma ${action.channel === 'email' ? 'e-posta' : 'WhatsApp'} ile gönderildi (${result.sentTo})` : `Hatırlatma gönderimi başarısız: ${result.error ?? ''}`,
  }, ctx);

  return updated!;
}

export type DunningActionRow = {
  id: string; invoiceId: string; invoiceDocNo: string; partnerName: string; level: number; channel: string; status: string;
  subject: string | null; body: string; sentAt: Date | null; sentTo: string | null; createdAt: Date;
};

/** `/finans/tahsilat-takibi` listesi: taslak/onay bekleyen/gönderilen tüm eylemler (fatura+cari ile birlikte) */
export async function listDunningActions(tx: DbOrTx, opts: { status?: DunningActionStatus[] } = {}): Promise<DunningActionRow[]> {
  const conds = opts.status?.length ? [inArray(dunningActions.status, opts.status)] : [];
  const rows = await tx
    .select({
      id: dunningActions.id, invoiceId: dunningActions.invoiceId, invoiceDocNo: invoices.docNo, partnerName: partners.name,
      level: dunningActions.level, channel: dunningActions.channel, status: dunningActions.status, subject: dunningActions.subject,
      body: dunningActions.body, sentAt: dunningActions.sentAt, sentTo: dunningActions.sentTo, createdAt: dunningActions.createdAt,
    })
    .from(dunningActions)
    .innerJoin(invoices, eq(invoices.id, dunningActions.invoiceId))
    .innerJoin(partners, eq(partners.id, dunningActions.partnerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(dunningActions.createdAt));
  return rows;
}

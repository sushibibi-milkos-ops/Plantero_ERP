import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db, dunningActions, dunningRules, invoices, partners } from '@plantero/db';
import { draftDunningMessage, type DunningLevel, type DunningTone } from '@plantero/ai';

function levelForDaysOverdue(days: number): DunningLevel {
  if (days >= 30) return 4;
  if (days >= 15) return 3;
  if (days >= 3) return 2;
  return 1;
}

/**
 * Tahsilat hatırlatma zamanlayıcısı: vadesi geçmiş satış faturaları için AI (yoksa şablon
 * fallback) ile Türkçe hatırlatma taslağı üretir ve `dunning_actions`'a 'draft'/'pending_approval'
 * olarak yazar. Gerçek gönderim finans modülünün tahsilat takibi ekranında onaylanınca yapılır.
 */
export async function runDunningScheduler(): Promise<Record<string, unknown>> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const windowStart = new Date(today.getTime() - 400 * 86_400_000).toISOString().slice(0, 10); // makul bir üst sınır

  const overdue = await db
    .select({ id: invoices.id, docNo: invoices.docNo, partnerId: invoices.partnerId, partnerName: partners.name, grandTotal: invoices.grandTotal, residual: invoices.residual, dueDate: invoices.dueDate, currency: invoices.currency })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(and(eq(invoices.kind, 'sales'), inArray(invoices.status, ['posted', 'partially_paid']), lt(invoices.dueDate, todayIso), gte(invoices.dueDate, windowStart)));

  const rules = await db.select().from(dunningRules).where(eq(dunningRules.isActive, true));

  const existingActions = overdue.length
    ? await db.select({ invoiceId: dunningActions.invoiceId, level: dunningActions.level }).from(dunningActions).where(inArray(dunningActions.invoiceId, overdue.map((i) => i.id)))
    : [];
  const existingKey = new Set(existingActions.map((a) => `${a.invoiceId}-${a.level}`));

  let drafted = 0;
  let skipped = 0;

  for (const inv of overdue) {
    const days = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
    const level = levelForDaysOverdue(days);

    if (existingKey.has(`${inv.id}-${level}`)) {
      skipped++;
      continue; // bu seviye için zaten taslak üretilmiş
    }

    const rule = rules.find((r) => r.level === level);
    const channel = (rule?.channels?.[0] as string | undefined) ?? 'email';
    const tone = rule?.tone as DunningTone | undefined;

    const draft = await draftDunningMessage({ docNo: inv.docNo, grandTotal: inv.grandTotal, residual: inv.residual, dueDate: inv.dueDate, currency: inv.currency }, { name: inv.partnerName }, level, tone);

    await db.insert(dunningActions).values({
      invoiceId: inv.id,
      partnerId: inv.partnerId,
      ruleId: rule?.id ?? null,
      level,
      channel,
      status: rule?.requiresApproval === false ? 'pending_approval' : 'draft',
      subject: draft.subject,
      body: draft.body,
      aiGenerated: true,
    });
    drafted++;
  }

  return { evaluated: overdue.length, drafted, skipped, note: 'Onay/gönderim finans modülünün tahsilat takibi ekranında yapılır.' };
}

import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, invoices, partners, dunningRules } from '@plantero/db';
import { findDueInvoices, listDunningActions, type DunningActionRow } from '@plantero/core';

export type DueInvoiceDto = {
  id: string; docNo: string; partnerId: string; partnerName: string; partnerEmail: string | null; partnerWhatsapp: string | null;
  grandTotal: string; residual: string; dueDate: string; currency: string; daysOverdue: number; level: number; dunningLevel: number; lastDunningAt: string | null;
  hasDraft: boolean;
};

export type AgingKpis = { b0_30: string; b31_60: string; b61_90: string; b90plus: string; totalOverdue: string; invoiceCount: number };

/** `/finans/tahsilat-takibi`: vadesi geçmiş faturalar + hangileri için zaten taslak var */
export async function getDunningPage(): Promise<{ due: DueInvoiceDto[]; aging: AgingKpis; actions: DunningActionRow[] }> {
  const [due, actions] = await Promise.all([findDueInvoices(db), listDunningActions(db)]);
  const draftedKeys = new Set(actions.map((a) => `${a.invoiceId}:${a.level}`));

  const buckets = { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 };
  let total = 0;
  for (const r of due) {
    const amt = Number(r.residual);
    total += amt;
    if (r.daysOverdue <= 30) buckets.b0_30 += amt;
    else if (r.daysOverdue <= 60) buckets.b31_60 += amt;
    else if (r.daysOverdue <= 90) buckets.b61_90 += amt;
    else buckets.b90plus += amt;
  }

  return {
    due: due.map((r) => ({
      id: r.id, docNo: r.docNo, partnerId: r.partnerId, partnerName: r.partnerName, partnerEmail: r.partnerEmail, partnerWhatsapp: r.partnerWhatsapp,
      grandTotal: r.grandTotal, residual: r.residual, dueDate: r.dueDate, currency: r.currency, daysOverdue: r.daysOverdue, level: r.level,
      dunningLevel: r.dunningLevel, lastDunningAt: r.lastDunningAt ? r.lastDunningAt.toISOString() : null, hasDraft: draftedKeys.has(`${r.id}:${r.level}`),
    })),
    aging: { b0_30: buckets.b0_30.toFixed(4), b31_60: buckets.b31_60.toFixed(4), b61_90: buckets.b61_90.toFixed(4), b90plus: buckets.b90plus.toFixed(4), totalOverdue: total.toFixed(4), invoiceCount: due.length },
    actions,
  };
}

export type DunningRuleRow = { level: number; name: string; daysOffset: number; channels: string[]; tone: string; requiresApproval: boolean; isActive: boolean };

export async function listDunningRules(): Promise<DunningRuleRow[]> {
  const rows = await db.select().from(dunningRules).orderBy(asc(dunningRules.level));
  return rows.map((r) => ({ level: r.level, name: r.name, daysOffset: r.daysOffset, channels: (r.channels ?? []) as string[], tone: r.tone, requiresApproval: r.requiresApproval, isActive: r.isActive }));
}

export async function getInvoiceForDraft(invoiceId: string) {
  const [row] = await db
    .select({ inv: invoices, partnerName: partners.name, partnerEmail: partners.email, partnerWhatsapp: partners.whatsapp })
    .from(invoices)
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  return row ?? null;
}


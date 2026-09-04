import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { invoices, dunningActions, dunningRules, approvals, type Tx } from '@plantero/db';
import { withRollback, seedBase, ctx, suffix, daysFromNow, type Base } from '../__tests__/helpers.js';
import { levelForDaysOverdue, findDueInvoices, createDunningDraft, approveDunningDraft, recordDunningSendResult, hasDunningActionForLevel } from './dunning.js';

async function makeOverdueInvoice(tx: Tx, b: Base, opts: { daysOverdue: number; residual?: string }) {
  const s = suffix();
  const [inv] = await tx
    .insert(invoices)
    .values({
      docNo: `INV-TEST-${s}`, kind: 'sales', status: 'posted', partnerId: b.customer.id,
      invoiceDate: daysFromNow(-opts.daysOverdue - 30), dueDate: daysFromNow(-opts.daysOverdue),
      grandTotal: '1000.0000', residual: opts.residual ?? '1000.0000',
    })
    .returning();
  return inv!;
}

describe('finance/dunning — levelForDaysOverdue', () => {
  it('vade gününe göre doğru seviyeyi döner', () => {
    expect(levelForDaysOverdue(0)).toBe(1);
    expect(levelForDaysOverdue(2)).toBe(1);
    expect(levelForDaysOverdue(3)).toBe(2);
    expect(levelForDaysOverdue(14)).toBe(2);
    expect(levelForDaysOverdue(15)).toBe(3);
    expect(levelForDaysOverdue(29)).toBe(3);
    expect(levelForDaysOverdue(30)).toBe(4);
    expect(levelForDaysOverdue(90)).toBe(4);
  });
});

describe('finance/dunning — findDueInvoices', () => {
  it('yalnızca vadesi geçmiş VE bakiyesi olan satış faturalarını, doğru seviyeyle döner', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const overdue20 = await makeOverdueInvoice(tx, b, { daysOverdue: 20 });
      const paid = await makeOverdueInvoice(tx, b, { daysOverdue: 20, residual: '0.0000' });
      const notDueYet = await makeOverdueInvoice(tx, b, { daysOverdue: -5 }); // henüz vadesi gelmemiş

      const due = await findDueInvoices(tx, { partnerId: b.customer.id });
      const ids = due.map((d) => d.id);
      expect(ids).toContain(overdue20.id);
      expect(ids).not.toContain(paid.id); // bakiyesi 0 — hatırlatma gerekmiyor
      expect(ids).not.toContain(notDueYet.id); // vadesi henüz geçmedi

      const row = due.find((d) => d.id === overdue20.id)!;
      expect(row.level).toBe(3); // 15-29 gün → seviye 3
      expect(row.daysOverdue).toBeGreaterThanOrEqual(19);
    });
  });
});

describe('finance/dunning — createDunningDraft / approveDunningDraft / recordDunningSendResult', () => {
  it('onay gerektiren seviyede: taslak pending_approval + approvals kuyruğuna düşer; onay → gönderim → invoices.dunningLevel artar', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await tx.insert(dunningRules).values({ level: 2, name: 'Test seviye 2', daysOffset: 3, requiresApproval: true }).onConflictDoUpdate({ target: dunningRules.level, set: { requiresApproval: true } });
      const inv = await makeOverdueInvoice(tx, b, { daysOverdue: 5 });

      const draft = await createDunningDraft(tx, { invoiceId: inv.id, partnerId: b.customer.id, level: 2, channel: 'email', subject: 'Konu', body: 'Gövde metni', aiGenerated: true }, ctx);
      expect(draft.status).toBe('pending_approval');
      expect(draft.approvalId).toBeTruthy();

      const [approval] = await tx.select().from(approvals).where(eq(approvals.id, draft.approvalId!));
      expect(approval!.kind).toBe('dunning_message');
      expect(approval!.status).toBe('pending');

      expect(await hasDunningActionForLevel(tx, inv.id, 2)).toBe(true);
      expect(await hasDunningActionForLevel(tx, inv.id, 3)).toBe(false);

      const approved = await approveDunningDraft(tx, draft.id, ctx);
      expect(approved.status).toBe('approved');

      const [beforeInvoice] = await tx.select({ dunningLevel: invoices.dunningLevel }).from(invoices).where(eq(invoices.id, inv.id));
      expect(beforeInvoice!.dunningLevel).toBe(0);

      const sent = await recordDunningSendResult(tx, draft.id, { ok: true, sentTo: 'musteri@example.com' }, ctx);
      expect(sent.status).toBe('sent');
      expect(sent.sentAt).toBeTruthy();

      const [afterInvoice] = await tx.select({ dunningLevel: invoices.dunningLevel, lastDunningAt: invoices.lastDunningAt }).from(invoices).where(eq(invoices.id, inv.id));
      expect(afterInvoice!.dunningLevel).toBe(1);
      expect(afterInvoice!.lastDunningAt).toBeTruthy();

      const [approvalAfter] = await tx.select().from(approvals).where(eq(approvals.id, draft.approvalId!));
      expect(approvalAfter!.status).toBe('approved');
    });
  });

  it('onay gerektirmeyen seviyede (requiresApproval=false): taslak doğrudan approved, approvals satırı YOK', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await tx.insert(dunningRules).values({ level: 1, name: 'Test seviye 1', daysOffset: -3, requiresApproval: false }).onConflictDoUpdate({ target: dunningRules.level, set: { requiresApproval: false } });
      const inv = await makeOverdueInvoice(tx, b, { daysOverdue: 1 });

      const draft = await createDunningDraft(tx, { invoiceId: inv.id, partnerId: b.customer.id, level: 1, channel: 'email', subject: null, body: 'Nazik hatırlatma', aiGenerated: false }, ctx);
      expect(draft.status).toBe('approved');
      expect(draft.approvalId).toBeNull();
    });
  });

  it('gönderim başarısız olursa: durum failed, invoices.dunningLevel DEĞİŞMEZ', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const inv = await makeOverdueInvoice(tx, b, { daysOverdue: 40 });
      const draft = await createDunningDraft(tx, { invoiceId: inv.id, partnerId: b.customer.id, level: 4, channel: 'whatsapp', subject: null, body: 'İhtar', aiGenerated: false }, ctx);

      const failed = await recordDunningSendResult(tx, draft.id, { ok: false, sentTo: '+905551112233', error: 'Sandbox hata' }, ctx);
      expect(failed.status).toBe('failed');
      expect(failed.error).toBe('Sandbox hata');

      const [afterInvoice] = await tx.select({ dunningLevel: invoices.dunningLevel }).from(invoices).where(eq(invoices.id, inv.id));
      expect(afterInvoice!.dunningLevel).toBe(0);

      const [action] = await tx.select().from(dunningActions).where(eq(dunningActions.id, draft.id));
      expect(action!.status).toBe('failed');
    });
  });
});

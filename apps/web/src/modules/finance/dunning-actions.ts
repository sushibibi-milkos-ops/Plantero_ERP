'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import { createDunningDraft, approveDunningDraft, recordDunningSendResult, levelForDaysOverdue, hasDunningActionForLevel, type DunningLevel } from '@plantero/core';
import { businessDate } from '@plantero/core/dates';
import { draftDunningMessage, type DunningTone } from '@plantero/ai';
// Not: '@plantero/integrations' barrel'ı (index.ts) pdf/render.ts üzerinden playwright-core'u da
// re-export eder; bu server action dosyası client referans grafiğine dahil olduğundan barrel yerine
// yalnızca ihtiyaç duyulan alt modülden içe aktarılır (aksi halde webpack playwright-core'un
// bidi/native bağımlılıklarını çözemediği için build hatası verir — bkz. sales/actions.ts aynı not).
import { email } from '@plantero/integrations/messaging/email';
import { whatsapp } from '@plantero/integrations/messaging/whatsapp';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';
import { getInvoiceForDraft, listDunningRules } from './dunning-queries';

function revalidateDunning() {
  revalidatePath('/finans/tahsilat-takibi');
  revalidatePath('/kokpit');
}

const createDraftSchema = z.object({ invoiceId: z.string().uuid(), channel: z.enum(['email', 'whatsapp']).optional() });

/** AI (yoksa şablon fallback) ile taslak üretir + `dunning_actions`e yazar (seviye vade gününden hesaplanır) */
export const createDunningDraftAction = withAudit('finance.createDunningDraft', async (raw: z.infer<typeof createDraftSchema>) => {
  const user = await requirePermission('finance.dunning');
  const input = createDraftSchema.parse(raw);
  const row = await getInvoiceForDraft(input.invoiceId);
  if (!row) throw new Error('Fatura bulunamadı');

  // findDueInvoices (packages/core/src/finance/dunning.ts) ile BİREBİR aynı gün-sınırı mantığı:
  // Europe/Istanbul takvim gününe göre businessDate() — ham Date.now() kullanılırsa gün ortasında
  // (~00:00-21:00 UTC) ekran ile bu eylemin hesapladığı seviye farklılaşabilir (Tur 4 P1 bulgusu).
  const todayIso = businessDate(new Date());
  const daysOverdue = Math.max(0, Math.floor((new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${row.inv.dueDate}T00:00:00Z`).getTime()) / 86_400_000));
  const level = levelForDaysOverdue(daysOverdue) as DunningLevel;
  if (await hasDunningActionForLevel(db, input.invoiceId, level)) throw new Error(`Bu fatura için ${level}. seviye hatırlatma zaten oluşturulmuş`);

  const rules = await listDunningRules();
  const rule = rules.find((r) => r.level === level);
  const channel = input.channel ?? ((rule?.channels[0] as 'email' | 'whatsapp' | undefined) ?? 'email');
  const tone = rule?.tone as DunningTone | undefined;

  const draft = await draftDunningMessage(
    { docNo: row.inv.docNo, grandTotal: row.inv.grandTotal, residual: row.inv.residual, dueDate: row.inv.dueDate, currency: row.inv.currency },
    { name: row.partnerName },
    level,
    tone,
  );

  const action = await db.transaction((tx) => createDunningDraft(tx, { invoiceId: input.invoiceId, partnerId: row.inv.partnerId, level, channel, subject: draft.subject, body: draft.body, aiGenerated: true }, user.actor));
  revalidateDunning();
  return { data: { id: action.id, status: action.status, level, channel, subject: draft.subject, body: draft.body }, audit: { action: 'create' as const, tableName: 'dunning_actions', recordId: action.id, summary: `${row.inv.docNo} için seviye ${level} hatırlatma taslağı üretildi (AI)` } };
});

const approveSchema = z.object({ dunningActionId: z.string().uuid() });

export const approveDunningDraftAction = withAudit('finance.approveDunningDraft', async (raw: z.infer<typeof approveSchema>) => {
  const user = await requirePermission('finance.dunning');
  const input = approveSchema.parse(raw);
  const action = await db.transaction((tx) => approveDunningDraft(tx, input.dunningActionId, user.actor));
  revalidateDunning();
  return { data: { status: action.status }, audit: { action: 'approve' as const, tableName: 'dunning_actions', recordId: input.dunningActionId, summary: 'Hatırlatma taslağı onaylandı' } };
});

const sendSchema = z.object({ dunningActionId: z.string().uuid(), subject: z.string().trim().optional().nullable(), body: z.string().trim().min(1, 'Metin boş olamaz') });

/** Onayla ve gönder: gerekiyorsa önce onaylar, sonra sandbox/gerçek email veya WhatsApp gönderir */
export const approveAndSendDunningAction = withAudit('finance.approveAndSendDunning', async (raw: z.infer<typeof sendSchema>) => {
  const user = await requirePermission('finance.dunning');
  const input = sendSchema.parse(raw);

  // Onay (DB) → gerçek gönderim (dış entegrasyon, transaction DIŞINDA — sandbox/canlı çağrı geri
  // alınamaz, bu yüzden bir DB rollback'inin göndermeyi "geri alması" gibi yanlış bir izlenim
  // yaratmaz) → gönderim SONUCUNU işleyen ayrı bir DB yazımı (applyEInvoiceResult ile aynı örüntü).
  const approved = await db.transaction((tx) => approveDunningDraft(tx, input.dunningActionId, user.actor));
  const invRow = await getInvoiceForDraft(approved.invoiceId);
  if (!invRow) throw new Error('Fatura bulunamadı');

  const to = approved.channel === 'email' ? (invRow.partnerEmail ?? `${invRow.partnerName.toLowerCase().replace(/\s+/g, '.')}@sandbox.plantero.local`) : (invRow.partnerWhatsapp ?? '+905000000000');

  const result = approved.channel === 'email'
    ? await email.sendEmail({ to, subject: input.subject ?? approved.subject ?? 'Tahsilat hatırlatması', body: input.body })
    : await whatsapp.sendWhatsApp({ to, body: input.body });

  const action = await db.transaction((tx) => recordDunningSendResult(tx, input.dunningActionId, { ok: result.ok, sentTo: to, error: result.error ?? null }, user.actor));
  revalidateDunning();
  return {
    data: { status: action.status, sandbox: result.sandbox, providerId: result.providerId },
    audit: { action: 'other' as const, tableName: 'dunning_actions', recordId: input.dunningActionId, summary: result.ok ? `Hatırlatma ${action.channel === 'email' ? 'e-posta' : 'WhatsApp'} ile gönderildi (${result.sandbox ? 'sandbox' : 'canlı'})` : `Gönderim başarısız: ${result.error}` },
  };
});

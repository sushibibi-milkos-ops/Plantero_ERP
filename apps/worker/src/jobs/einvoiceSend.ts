import { eq } from 'drizzle-orm';
import { db, invoiceLines, invoices, partners } from '@plantero/db';
import { bizimhesap, type EInvoiceKind } from '@plantero/integrations';

export type EinvoiceSendJobData = { invoiceId: string };

/**
 * e-Belge gönderim işlemcisi (anlık kuyruk): faturayı ve satırlarını okuyup Bizimhesap'a
 * gönderir, sonucu `invoices.e_invoice_*` alanlarına yazar. Muhasebe kaydı zaten
 * `postJournalEntry` ile fatura oluşturulurken atılmış olmalıdır — bu iş yalnızca e-belge
 * durumunu günceller.
 */
export async function processEinvoiceSend(data: EinvoiceSendJobData): Promise<Record<string, unknown>> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
  if (!inv) return { ok: false, error: 'Fatura bulunamadı' };

  const [partner] = await db.select().from(partners).where(eq(partners.id, inv.partnerId)).limit(1);
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));

  const kind: EInvoiceKind = inv.eInvoiceType === 'none' ? 'e_arsiv' : (inv.eInvoiceType as EInvoiceKind);

  const result = await bizimhesap.sendInvoice({
    kind,
    docNo: inv.docNo,
    partnerName: partner?.name ?? '',
    partnerTaxNumber: partner?.taxNumber ?? undefined,
    partnerTaxOffice: partner?.taxOffice ?? undefined,
    invoiceDate: inv.invoiceDate,
    currency: inv.currency,
    lines: lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, vatRate: l.vatRate, lineTotal: l.lineTotal })),
    subtotal: inv.subtotal,
    vatTotal: inv.vatTotal,
    grandTotal: inv.grandTotal,
  });

  await db
    .update(invoices)
    .set({
      eInvoiceStatus: result.ok ? (result.status === 'accepted' ? 'accepted' : 'sent') : 'error',
      eInvoiceUuid: result.uuid || inv.eInvoiceUuid,
      eInvoiceSentAt: new Date(),
      eInvoiceError: result.error ?? null,
    })
    .where(eq(invoices.id, inv.id));

  return { ok: result.ok, uuid: result.uuid, status: result.status, sandbox: result.sandbox, error: result.error };
}

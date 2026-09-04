import { eq } from 'drizzle-orm';
import { invoices, partners, type DbOrTx } from '@plantero/db';
import { writeAudit } from '../audit/index.js';
import { NotFoundError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * e-Belge (Bizimhesap) — `docs/modules/muhasebe.md` `/muhasebe/faturalar` "e-Fatura gönder".
 *
 * Codebase kuralı gereği (bkz. `apps/worker/src/jobs/einvoiceSend.ts`, `apps/web/src/modules/
 * purchasing/actions.ts`) `packages/core` HİÇBİR entegrasyon paketini (`@plantero/integrations`,
 * `@plantero/ai`) import ETMEZ — pnpm workspace'te bu paket bir bağımlılık olarak bildirilmemiş
 * (`packages/core/package.json` dondurulmuş kapsam dışında). Gerçek `bizimhesap.sendInvoice(...)`
 * çağrısı web katmanında (`apps/web/src/modules/accounting/actions.ts`) yapılır; bu dosya yalnızca
 * SONUCU faturaya işleyen saf DB fonksiyonunu sağlar — tıpkı `einvoiceSend.ts` worker job'unun
 * kendi `invoices.e_invoice_*` güncellemesini doğrudan yaptığı gibi.
 */

export type EInvoiceKind = 'e_fatura' | 'e_arsiv' | 'export';
export type EInvoiceSendStatus = 'accepted' | 'queued' | 'rejected' | 'error';

/** Mükellef değilse e-Arşiv, ihracatsa 'export', mükellefse e-Fatura. */
export function resolveEInvoiceKind(partner: { isEInvoiceRegistered: boolean }, invoice: { isExport: boolean }): EInvoiceKind {
  if (invoice.isExport) return 'export';
  return partner.isEInvoiceRegistered ? 'e_fatura' : 'e_arsiv';
}

export type ApplyEInvoiceResultInput = {
  kind: EInvoiceKind;
  ok: boolean;
  uuid: string;
  ettn?: string | null;
  status: EInvoiceSendStatus;
  error?: string | null;
};

/** Bizimhesap sonucunu faturaya işler (`invoices.e_invoice_*`) + audit izi bırakır. */
export async function applyEInvoiceResult(tx: DbOrTx, invoiceId: string, result: ApplyEInvoiceResultInput, ctx: ActorCtx): Promise<typeof invoices.$inferSelect> {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new NotFoundError('Fatura', invoiceId);

  const eInvoiceStatus = !result.ok ? 'error' : result.status === 'accepted' ? 'accepted' : result.status === 'rejected' ? 'rejected' : 'sent';
  const [updated] = await tx
    .update(invoices)
    .set({
      eInvoiceType: result.kind, eInvoiceStatus, eInvoiceUuid: result.uuid || invoice.eInvoiceUuid,
      eInvoiceNo: result.ettn ?? invoice.eInvoiceNo, eInvoiceSentAt: new Date(), eInvoiceError: result.error ?? null,
      updatedBy: ctx.userId ?? null,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  await writeAudit(tx, {
    action: 'other', tableName: 'invoices', recordId: invoiceId,
    summary: `${invoice.docNo}: e-belge ${result.kind} gönderimi — ${eInvoiceStatus}${result.error ? ` (${result.error})` : ''}`,
    after: { eInvoiceType: result.kind, eInvoiceStatus, eInvoiceUuid: result.uuid },
  }, ctx);

  return updated!;
}

/** Bir faturanın e-belge gönderimi için ihtiyaç duyulan cari/satır verisini toplar (web katmanı `EInvoiceInput` oluşturur). */
export async function getEInvoiceSendContext(tx: DbOrTx, invoiceId: string) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new NotFoundError('Fatura', invoiceId);
  const [partner] = await tx.select().from(partners).where(eq(partners.id, invoice.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', invoice.partnerId);
  return { invoice, partner };
}

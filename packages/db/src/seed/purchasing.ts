import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { receipts, invoices } from '../schema/index.js';
import { SYSTEM_ACTOR, writeAudit, createPurchaseInvoiceFromReceipt } from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Satın alma modülü seed'i — docs/INVARIANTS.md I23 ("Satın alma faturalama zinciri").
 *
 * `stock` ve `production` adımları toplam 7 değerli mal kabulü (receipts) oluşturur ama bunları
 * hiçbir zaman faturalamaz — bu yüzden 320.999 (Faturası Gelmemiş Alımlar) hesabı iki defterde de
 * kalıcı olarak kapanmamış bakiyede kalır ve 191 (İndirilecek KDV) hiç doğmaz (I23, I18, I12).
 * `apps/web/src/app/(app)/satin-alma` ekranları (siparişler/mal kabul-fatura eşleştirme/onay kuyruğu)
 * henüz yazılmadı — bu, ayrı bir modül turunun konusu (docs/INVARIANTS.md I23 notu). Bu adım o UI'yı
 * ikame etmez; yalnızca seed'in ürettiği geçmiş mal kabullerini, gerçek akışta kullanılacak TEK
 * servis (`packages/core/src/purchasing/invoicing.ts` → `createPurchaseInvoiceFromReceipt`) üzerinden
 * geriye dönük faturalayarak her `db:reset` sonrasında I23'ün kalıcı biçimde kırmızı kalmasını önler.
 *
 * Idempotent: her mal kabul için önce iptal edilmemiş bir `invoices.kind='purchase'` satırı var mı
 * bakılır (`createPurchaseInvoiceFromReceipt` zaten aynı kontrolü RECEIPT_ALREADY_INVOICED ile
 * yapar — burada baştan filtrelemek gereksiz hata fırlatmayı önler).
 */

async function auditCreate(tx: DbOrTx, tableName: string, recordId: string, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName, recordId, summary }, SYSTEM_ACTOR);
}

/** `YYYY-MM-DD` üzerine gün ekler (takvim aritmetiği, UTC) — diğer seed dosyalarındaki yerel yardımcıyla aynı desen. */
const addDaysStr = (base: string, days: number): string => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export async function seedPurchasing(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const rows = await tx
    .select({
      id: receipts.id,
      docNo: receipts.docNo,
      supplierDeliveryDate: receipts.supplierDeliveryDate,
      receivedAt: receipts.receivedAt,
      partnerId: receipts.partnerId,
    })
    .from(receipts)
    .where(sql`${receipts.status} <> 'draft' AND ${receipts.status} <> 'cancelled'`)
    .orderBy(receipts.docNo);

  let count = 0;
  for (const r of rows) {
    if (!r.partnerId) continue; // tedarikçisiz mal kabul faturalanamaz (invoicing.ts aynı kontrolü yapar)

    const already = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.kind, 'purchase'), eq(invoices.receiptId, r.id), sql`${invoices.status} <> 'cancelled'`))
      .limit(1);
    if (already.length) continue;

    // Tedarikçi faturası genelde teslimattan birkaç gün sonra ulaşır — mal kabul tarihinden (veya
    // `supplierDeliveryDate` yoksa fiilen kabul edildiği `receivedAt` gününden) 2 gün sonrası kullanılır.
    const baseDay = r.supplierDeliveryDate ?? (r.receivedAt ? r.receivedAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    const invoiceDate = addDaysStr(baseDay, 2);

    const { invoice } = await createPurchaseInvoiceFromReceipt(tx, r.id, SYSTEM_ACTOR, { invoiceDate });
    await auditCreate(
      tx,
      'invoices',
      invoice.id,
      `Alış faturası ${invoice.docNo} mal kabul ${r.docNo} üzerinden oluşturuldu (geriye dönük faturalama — seed)`,
    );
    count += 1;
  }

  summary.add('invoices (alış faturası)', count);
  log('purchasing', `${count} mal kabul geriye dönük faturalandı`);
}

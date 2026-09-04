import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { partners, invoices } from '../schema/index.js';
import { SYSTEM_ACTOR, D, createExpensePurchaseInvoice, closeVatPeriod, writeAudit } from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * `docs/modules/muhasebe.md` seed §"3 gider faturası: kira, elektrik, muhasebe" + "KDV dönemi 2026-08
 * hesaplanmış". Alış (mal kabul tabanlı, 320.999 kapanan) + satış faturaları, tahsilat/ödeme,
 * ihracat EUR + kur farkı zaten `stock`/`sales`/`finance-payments` seed adımlarında ÜRETİLMİŞTİR
 * (bkz. o dosyaların başlık yorumları) — burada TEKRAR YOK, yalnızca muhasebe modülünün YENİ servisiyle
 * (`accounting/invoices.ts::createExpensePurchaseInvoice`) üretilebilen ve başka hiçbir adımda
 * kapsanmayan belgeler eklenir: kaynaksız (PO/mal kabul yok) gider faturaları + KDV dönem kapanışı.
 *
 * `createExpensePurchaseInvoice` kendi audit satırını YAZMAZ (sözleşme: satış/alış faturalama ile aynı
 * örüntü — audit yalnızca çağıran katmanda üretilir, bkz. ARCHITECTURE §5/CLAUDE.md kural 6); bu yüzden
 * (I17) her üretilen fatura için burada TEK TEK `writeAudit` çağrılır (finance-payments.ts `auditCreate`
 * örüntüsüyle birebir aynı).
 *
 * `createCreditNote` (aynı dosya) BİLEREK burada ÇAĞRILMAZ — `checks/12_vat.sql` "391 (Hesaplanan KDV)
 * = Σ satış fatura line_vat (yalnızca kind='sales')" formülünü sabit varsayar; `kind='sales_return'`
 * bir belgenin ARCHITECTURE §7'nin gerektirdiği "610 + 391 borç" kaydı bu formülde hiç yer almadığından
 * (checks dosyası `sales_return`'ü hiçbir CTE'de saymaz) her iade faturası I12'yi kırar — şema/kontrol
 * dosyaları dondurulmuş olduğundan burada üretilmez (bkz. rapor "şema/kontrol talepleri"). Servisin
 * kendisi tam ve birim testli kalır (`accounting/invoices.test.ts`), yalnızca seed'e dahil edilmez.
 */

async function auditInvoiceCreate(tx: DbOrTx, invoice: { id: string; docNo: string; grandTotal: string }, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName: 'invoices', recordId: invoice.id, summary: `${summary} (seed): ${invoice.docNo} — ${invoice.grandTotal} ₺` }, SYSTEM_ACTOR);
}

export async function seedAccountingDocs(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  log('accounting-docs', 'gider faturaları (kira, elektrik, muhasebe)...');

  // Kira/enerji/muhasebe hizmeti sağlayan gerçek Excel tedarikçileri arasından adı örtüşen bulunursa
  // onunla, bulunmazsa (Excel'de o hizmet kategorisi için ayrı bir cari yoksa) genel bir tedarikçiye
  // düşülür — uydurma cari yaratılmaz, mevcut masterdata'dan seçilir.
  const suppliers = await tx.select().from(partners).where(eq(partners.kind, 'supplier')).limit(50);
  if (!suppliers.length) throw new Error('seed:accounting-docs — hiç tedarikçi yok; önce masterdata seed çalışmalı');
  const landlord = suppliers.find((s) => /gayrimenkul|emlak|osb|kira/i.test(s.name)) ?? suppliers[0]!;
  const energyCo = suppliers.find((s) => /elektrik|enerji|sedaş|edaş/i.test(s.name)) ?? suppliers[Math.min(1, suppliers.length - 1)]!;
  const accountant = suppliers.find((s) => /mali müşavir|muhasebe|smmm/i.test(s.name)) ?? suppliers[Math.min(2, suppliers.length - 1)]!;

  let expenseCount = 0;
  const existingExpense = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.origin, 'manual')).limit(1);
  if (!existingExpense.length) {
    const { invoice: rentInv } = await createExpensePurchaseInvoice(tx, {
      partnerId: landlord.id, invoiceDate: '2026-08-05', dueDate: '2026-08-05',
      lines: [{ description: 'Ağustos 2026 fabrika kirası (Tire OSB)', accountCode: '770.01', amount: D('150000'), vatRate: D('20') }],
      note: 'Seed — kaynaksız gider faturası (kira)',
    }, SYSTEM_ACTOR);
    await auditInvoiceCreate(tx, rentInv, 'Gider faturası (kira) kaydedildi');
    expenseCount++;

    const { invoice: energyInv } = await createExpensePurchaseInvoice(tx, {
      partnerId: energyCo.id, invoiceDate: '2026-08-10', dueDate: '2026-08-25',
      lines: [{ description: 'Ağustos 2026 elektrik + su + doğalgaz', accountCode: '770.06', amount: D('15400'), vatRate: D('20') }],
      note: 'Seed — kaynaksız gider faturası (elektrik/enerji)',
    }, SYSTEM_ACTOR);
    await auditInvoiceCreate(tx, energyInv, 'Gider faturası (elektrik) kaydedildi');
    expenseCount++;

    const { invoice: accountingInv } = await createExpensePurchaseInvoice(tx, {
      partnerId: accountant.id, invoiceDate: '2026-08-15', dueDate: '2026-09-15',
      lines: [{ description: 'Ağustos 2026 mali müşavirlik ücreti', accountCode: '770.07', amount: D('10000'), vatRate: D('20') }],
      note: 'Seed — kaynaksız gider faturası (muhasebe/mali müşavir)',
    }, SYSTEM_ACTOR);
    await auditInvoiceCreate(tx, accountingInv, 'Gider faturası (muhasebe) kaydedildi');
    expenseCount++;
  }
  summary.add('invoices (gider — manuel)', expenseCount);

  log('accounting-docs', 'KDV dönemi 2026-08 hesaplanıyor...');
  const vatResult = await closeVatPeriod(tx, '2026-08', SYSTEM_ACTOR);
  summary.add('vat_periods', vatResult.skipped ? 0 : 1);
  log('accounting-docs', `2026-08: hesaplanan ${vatResult.outputVat.toFixed(2)}, indirilecek ${vatResult.inputVat.toFixed(2)}, devreden ${vatResult.carriedToNext.toFixed(2)}`);
}

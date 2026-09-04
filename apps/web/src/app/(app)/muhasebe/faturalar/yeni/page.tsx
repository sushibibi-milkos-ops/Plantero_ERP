import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listSuppliersForExpense, listExpenseAccounts } from '@/modules/accounting/queries';
import { ExpenseInvoiceForm } from '@/modules/accounting/components/expense-invoice-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Fatura' };
export const dynamic = 'force-dynamic';

/**
 * Kök neden (tur 2 P0/P1 muhasebe-faturalar-yeni-01/02): bu ekran önceden `/muhasebe/faturalar/
 * gider-yeni` idi — modülde "yeni fatura" adıyla eşleşen bir rota HİÇ yoktu, `/muhasebe/faturalar/
 * yeni` isteği `[id]` dinamik rotasına düşüp `id='yeni'` geçersiz UUID'siyle Postgres'te patlıyordu
 * (hata sınırı ham SQL basıyordu). Dizin `yeni`'ye taşındı: artık hem Faturalar listesindeki "yeni"
 * eylemiyle rota adı birebir örtüşüyor hem de `/muhasebe/faturalar/yeni` gerçek bir form açıyor.
 * Satış faturaları bu ekrandan DEĞİL, sevkiyattan otomatik doğar (docs/modules/muhasebe.md §2) —
 * `tur=satis` ile gelen kullanıcıya bunu açıkça söylüyoruz; `tur=alis` (ve varsayılan) gider/alış
 * faturası formunu açar.
 */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ tur?: string }> }) {
  await requirePermission('accounting.invoice');
  const { tur } = await searchParams;
  const [suppliers, expenseAccounts] = await Promise.all([listSuppliersForExpense(), listExpenseAccounts()]);

  if (tur === 'satis') {
    return (
      <>
        <PageHeader title="Yeni Fatura" description="Satış faturaları burada elle oluşturulmaz" />
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          Satış faturaları sevkiyattan (irsaliyeden) otomatik oluşur — bkz. <span className="font-medium text-foreground">Depo → Sevkiyat</span>.
          Kaynak siparişi/sevkiyatı olmayan bir tutarı kaydetmeniz gerekiyorsa gider/alış faturası formunu kullanın.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Gider / Alış Faturası" description="Kaynak PO/mal kabulü olmayan alış — kira, elektrik, muhasebe ücreti vb." />
      <ExpenseInvoiceForm suppliers={suppliers} expenseAccounts={expenseAccounts} />
    </>
  );
}

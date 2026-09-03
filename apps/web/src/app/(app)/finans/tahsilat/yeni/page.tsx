import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listPartnersForDirection, listBankAccountsForForm } from '@/modules/finance/queries';
import { RecordPaymentForm } from '@/modules/finance/components/record-payment-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Tahsilat / Ödeme' };
export const dynamic = 'force-dynamic';

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ direction?: string }> }) {
  await requirePermission('finance.manage');
  const { direction } = await searchParams;
  const [customers, suppliers, bankAccounts] = await Promise.all([
    listPartnersForDirection('inbound'),
    listPartnersForDirection('outbound'),
    listBankAccountsForForm(),
  ]);
  const partners = [
    ...customers.map((p) => ({ ...p, kind: 'customer' as const })),
    ...suppliers.map((p) => ({ ...p, kind: 'supplier' as const })),
  ];

  return (
    <>
      <PageHeader title="Yeni Tahsilat / Ödeme" description="Faturaya tahsis edin veya cari üzerinde avans olarak bırakın" />
      <RecordPaymentForm partners={partners} bankAccounts={bankAccounts} defaultDirection={direction === 'outbound' ? 'outbound' : 'inbound'} />
    </>
  );
}

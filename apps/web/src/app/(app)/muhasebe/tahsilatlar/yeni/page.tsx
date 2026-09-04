import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listPartnersForDirection, listBankAccountsForForm } from '@/modules/accounting/queries';
import { RecordPaymentForm } from '@/modules/accounting/components/record-payment-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Tahsilat / Ödeme' };
export const dynamic = 'force-dynamic';

export default async function NewPaymentPage() {
  await requirePermission('accounting.post');
  const [customers, suppliers, bankAccounts] = await Promise.all([
    listPartnersForDirection('inbound'),
    listPartnersForDirection('outbound'),
    listBankAccountsForForm(),
  ]);
  const partnerById = new Map([...customers, ...suppliers].map((p) => [p.id, p]));
  const partners = Array.from(partnerById.values());

  return (
    <>
      <PageHeader title="Yeni Tahsilat / Ödeme" description="Cariye ait açık faturalara tahsis edin ya da tahsissiz (avans) kaydedin" />
      <RecordPaymentForm partners={partners} bankAccounts={bankAccounts} />
    </>
  );
}

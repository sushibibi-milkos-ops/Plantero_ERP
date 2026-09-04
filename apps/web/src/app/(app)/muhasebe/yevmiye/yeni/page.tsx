import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listJournalsForForm, listPostableAccountsForForm, listPartnersForDirection } from '@/modules/accounting/queries';
import { ManualJournalForm } from '@/modules/accounting/components/manual-journal-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Manuel Yevmiye Fişi' };
export const dynamic = 'force-dynamic';

export default async function NewJournalEntryPage() {
  await requirePermission('accounting.post');
  const [journals, accounts, customers, suppliers] = await Promise.all([
    listJournalsForForm(), listPostableAccountsForForm(), listPartnersForDirection('inbound'), listPartnersForDirection('outbound'),
  ]);
  const partnerById = new Map([...customers, ...suppliers].map((p) => [p.id, p]));
  const partners = Array.from(partnerById.values());

  return (
    <>
      <PageHeader title="Manuel Yevmiye Fişi" description="Kaynak belgesi olmayan doğrudan muhasebe kaydı" />
      <ManualJournalForm journals={journals} accounts={accounts} partners={partners} />
    </>
  );
}

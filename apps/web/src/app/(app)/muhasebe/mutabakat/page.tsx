import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listReconciliationQueue, getReconciliationSummaryToday, listReconciliationHistory, listExpenseAccounts, listPartnersForDirection } from '@/modules/accounting/queries';
import { ReconciliationReview } from '@/modules/accounting/components/reconciliation-review';
import { ReconciliationHistoryTable } from '@/modules/accounting/components/reconciliation-history-table';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata: Metadata = { title: 'Mutabakat' };
export const dynamic = 'force-dynamic';

export default async function ReconciliationPage() {
  await requirePermission('accounting.reconcile');
  const [queue, summary, history, expenseAccounts, customers, suppliers] = await Promise.all([
    listReconciliationQueue(), getReconciliationSummaryToday(), listReconciliationHistory(), listExpenseAccounts(),
    listPartnersForDirection('inbound'), listPartnersForDirection('outbound'),
  ]);
  const partnerById = new Map([...customers, ...suppliers].map((p) => [p.id, p]));
  const partners = Array.from(partnerById.values());

  const decidedToday = summary.autoAppliedToday + summary.approvedToday;
  const totalToday = decidedToday + summary.suggestedTotal;

  return (
    <>
      <PageHeader
        title="Mutabakat"
        description={
          totalToday > 0
            ? `Bu sabah ${totalToday} öneri, ${summary.autoAppliedToday} otomatik uygulandı, ${summary.suggestedTotal} onay bekliyor`
            : 'Banka hareketleri için AI Mutabakat Ajanı önerileri'
        }
      />

      <Tabs defaultValue="queue">
        <TabsList variant="line">
          <TabsTrigger value="queue">Onay bekleyenler {summary.suggestedTotal > 0 ? `(${summary.suggestedTotal})` : ''}</TabsTrigger>
          <TabsTrigger value="history">Geçmiş</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-3">
          <ReconciliationReview queue={queue} partners={partners} expenseAccounts={expenseAccounts} />
        </TabsContent>
        <TabsContent value="history" className="mt-3">
          <ReconciliationHistoryTable rows={history} />
        </TabsContent>
      </Tabs>
    </>
  );
}

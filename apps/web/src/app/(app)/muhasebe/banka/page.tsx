import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listBankAccountsSummary, listBankTransactionsFor, listBankAccountsForForm, getReconciliationSummaryToday } from '@/modules/accounting/queries';
import { BankAccountsCards } from '@/modules/accounting/components/bank-accounts-cards';
import { BankTransactionsTable } from '@/modules/accounting/components/bank-transactions-table';
import { ImportStatementDialog } from '@/modules/accounting/components/import-statement-dialog';
import { RunReconciliationButton } from '@/modules/accounting/components/run-reconciliation-button';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Banka' };
export const dynamic = 'force-dynamic';

export default async function BankPage() {
  const user = await requirePermission('accounting.view');
  const [accounts, transactions, formAccounts, reconSummary] = await Promise.all([
    listBankAccountsSummary(), listBankTransactionsFor(), listBankAccountsForForm(), getReconciliationSummaryToday(),
  ]);

  return (
    <>
      <PageHeader
        title="Banka"
        description={`${accounts.length} hesap`}
        actions={
          userCan(user, 'accounting.reconcile') ? (
            <>
              <ImportStatementDialog bankAccounts={formAccounts} />
              <RunReconciliationButton />
            </>
          ) : undefined
        }
      />

      {reconSummary.suggestedTotal > 0 ? (
        <Link href="/muhasebe/mutabakat" className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-[13px] font-medium text-info transition-colors hover:bg-info/10">
          <span className="font-normal">{reconSummary.suggestedTotal} banka hareketi onay bekliyor — AI Mutabakat Ajanı öneriler üretti.</span>
          <span className="flex shrink-0 items-center gap-1">İncele <ArrowRight className="size-3.5" /></span>
        </Link>
      ) : null}

      <div className="mb-6">
        <BankAccountsCards accounts={accounts} />
      </div>

      <BankTransactionsTable rows={transactions} />
    </>
  );
}

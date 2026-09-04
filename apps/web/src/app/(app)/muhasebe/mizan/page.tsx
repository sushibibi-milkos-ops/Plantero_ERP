import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getTrialBalance } from '@/modules/accounting/queries';
import { TrialBalanceView } from '@/modules/accounting/components/trial-balance-view';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { D, ZERO } from '@plantero/core/money';

export const metadata: Metadata = { title: 'Mizan' };
export const dynamic = 'force-dynamic';

export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<{ ledger?: string }> }) {
  await requirePermission('accounting.view');
  const { ledger: ledgerParam } = await searchParams;
  const ledger = ledgerParam === 'UFRS' ? 'UFRS' : 'VUK';
  const rows = await getTrialBalance(ledger);

  const totalDebit = rows.reduce((a, r) => a.plus(D(r.debit)), ZERO);
  const totalCredit = rows.reduce((a, r) => a.plus(D(r.credit)), ZERO);

  return (
    <>
      <PageHeader
        title="Mizan"
        description={`${rows.length} hesap — ${ledger} defteri`}
        actions={
          <Button variant="outline" asChild>
            <a href={`/muhasebe/mizan/export?ledger=${ledger}`} download={`mizan-${ledger}.csv`}>
              <Download className="size-4" /> CSV indir
            </a>
          </Button>
        }
      >
        <div className="flex gap-1.5">
          <Button variant={ledger === 'VUK' ? 'default' : 'outline'} size="sm" asChild><Link href="/muhasebe/mizan?ledger=VUK">VUK</Link></Button>
          <Button variant={ledger === 'UFRS' ? 'default' : 'outline'} size="sm" asChild><Link href="/muhasebe/mizan?ledger=UFRS">UFRS</Link></Button>
        </div>
      </PageHeader>

      <TrialBalanceView rows={rows} totalDebit={totalDebit.toFixed(4)} totalCredit={totalCredit.toFixed(4)} />
    </>
  );
}

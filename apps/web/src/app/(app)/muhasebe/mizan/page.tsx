import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getTrialBalance } from '@/modules/accounting/queries';
import { TrialBalanceView } from '@/modules/accounting/components/trial-balance-view';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { D, ZERO } from '@plantero/core/money';

export const metadata: Metadata = { title: 'Mizan' };
export const dynamic = 'force-dynamic';

function totals(rows: Awaited<ReturnType<typeof getTrialBalance>>) {
  return {
    debit: rows.reduce((a, r) => a.plus(D(r.debit)), ZERO).toFixed(4),
    credit: rows.reduce((a, r) => a.plus(D(r.credit)), ZERO).toFixed(4),
  };
}

/**
 * Kök neden (tur 2 P1 muhasebe-mizan-02): defter seçici burada dolu/outline `Button` çiftiydi,
 * aynı seçim /muhasebe/yevmiye'de alt çizgili `TabsList variant="line"` idi — aynı modülde aynı
 * kavram iki farklı bileşenle sunuluyordu. Yevmiye'nin kalıbı birebir uygulanır: iki defter de
 * SUNUCUDA önceden yüklenir (URL parametresi yok), istemci tarafında Tabs ile geçilir.
 */
export default async function TrialBalancePage() {
  await requirePermission('accounting.view');
  const [vukRows, ufrsRows] = await Promise.all([getTrialBalance('VUK'), getTrialBalance('UFRS')]);
  const vukTotals = totals(vukRows);
  const ufrsTotals = totals(ufrsRows);

  return (
    <>
      <PageHeader title="Mizan" description={`${vukRows.length} hesap — VUK ve UFRS defterleri`} />

      <Tabs defaultValue="VUK">
        <TabsList variant="line">
          <TabsTrigger value="VUK">VUK</TabsTrigger>
          <TabsTrigger value="UFRS">UFRS</TabsTrigger>
        </TabsList>
        <TabsContent value="VUK" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <a href="/muhasebe/mizan/export?ledger=VUK" download="mizan-VUK.csv"><Download className="size-4" /> CSV indir</a>
            </Button>
          </div>
          <TrialBalanceView rows={vukRows} totalDebit={vukTotals.debit} totalCredit={vukTotals.credit} />
        </TabsContent>
        <TabsContent value="UFRS" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <a href="/muhasebe/mizan/export?ledger=UFRS" download="mizan-UFRS.csv"><Download className="size-4" /> CSV indir</a>
            </Button>
          </div>
          <TrialBalanceView rows={ufrsRows} totalDebit={ufrsTotals.debit} totalCredit={ufrsTotals.credit} />
        </TabsContent>
      </Tabs>
    </>
  );
}

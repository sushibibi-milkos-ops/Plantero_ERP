import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getTrialBalance } from '@/modules/accounting/queries';
import { TrialBalanceView } from '@/modules/accounting/components/trial-balance-view';
import { LedgerTabs } from '@/modules/accounting/components/ledger-tabs';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
 *
 * Kök neden (kritik bulgu muhasebe-mizan-03): "CSV indir" önceden sekmelerle tablo arasında kendi
 * satırındaydı — modülün diğer rotalarında (faturalar, banka, yevmiye, kdv, tahsilatlar) sayfa
 * eylemi PageHeader'ın sağındadır. Aktif defter artık `?ledger=` sorgu parametresinde tutulur
 * (`LedgerTabs` — finans modülündeki `ScenarioSelect` kalıbı) — PageHeader actions'taki CSV
 * bağlantısı sunucuda bu parametreyi okuyup her zaman doğru defteri indirir, sekmeler ile arama
 * kutusu arasında ayrı bir eylem satırı kalmaz.
 */
export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<{ ledger?: string }> }) {
  await requirePermission('accounting.view');
  const { ledger: ledgerParam } = await searchParams;
  const ledger: 'VUK' | 'UFRS' = ledgerParam === 'UFRS' ? 'UFRS' : 'VUK';
  const [vukRows, ufrsRows] = await Promise.all([getTrialBalance('VUK'), getTrialBalance('UFRS')]);
  const vukTotals = totals(vukRows);
  const ufrsTotals = totals(ufrsRows);

  return (
    <>
      <PageHeader
        title="Mizan"
        description={`${vukRows.length} hesap — VUK ve UFRS defterleri`}
        actions={
          // h-11 sm:h-8 (kritik bulgu, muhasebe-mobil-buton-01): 390px'te 32px yükseklikteydi.
          <Button variant="outline" size="sm" className="h-11 sm:h-8" asChild>
            <a href={`/muhasebe/mizan/export?ledger=${ledger}`} download={`mizan-${ledger}.csv`}><Download className="size-4" /> CSV indir</a>
          </Button>
        }
      />
      <LedgerTabs
        ledger={ledger}
        vuk={<TrialBalanceView rows={vukRows} totalDebit={vukTotals.debit} totalCredit={vukTotals.credit} />}
        ufrs={<TrialBalanceView rows={ufrsRows} totalDebit={ufrsTotals.debit} totalCredit={ufrsTotals.credit} />}
      />
    </>
  );
}

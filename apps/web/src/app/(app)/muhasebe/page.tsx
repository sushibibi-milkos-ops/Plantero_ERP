import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getDashboard } from '@/modules/accounting/queries';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';

export const metadata: Metadata = { title: 'Muhasebe' };
export const dynamic = 'force-dynamic';

const LINKS = [
  { href: '/muhasebe/faturalar', label: 'Faturalar', description: 'Satış, alış, iade faturaları — e-Fatura' },
  { href: '/muhasebe/tahsilatlar', label: 'Tahsilatlar', description: 'Tahsilat / ödeme kayıtları' },
  { href: '/muhasebe/banka', label: 'Banka', description: 'Hesaplar, ekstre içe aktarma' },
  { href: '/muhasebe/mutabakat', label: 'Mutabakat', description: 'AI Mutabakat Ajanı onay ekranı' },
  { href: '/muhasebe/yevmiye', label: 'Yevmiye', description: 'VUK / UFRS fiş defteri' },
  { href: '/muhasebe/hesap-plani', label: 'Hesap Planı', description: 'Tek Düzen Hesap Planı' },
  { href: '/muhasebe/mizan', label: 'Mizan', description: 'Borç / alacak / bakiye toplamları' },
  { href: '/muhasebe/kdv', label: 'KDV', description: 'Dönem hesaplama, devreden KDV' },
  { href: '/muhasebe/donemler', label: 'Dönemler', description: 'Mali dönem kapat / aç' },
];

export default async function AccountingHomePage() {
  await requirePermission('accounting.view');
  const d = await getDashboard();
  const bankDiffAbs = Math.abs(Number(d.bankDiffTry));

  return (
    <>
      <PageHeader title="Muhasebe" description="Faturalar, tahsilat, banka mutabakatı, yevmiye ve KDV — tek bakışta" />

      <KpiStripRow>
        <KpiCard variant="strip" title="Banka farkı (TL hesaplar)" value={d.bankDiffTry} format="money" invertDelta href="/muhasebe/banka" />
        <KpiCard variant="strip" title="Açık alacak" value={d.openReceivable} format="money" href="/muhasebe/faturalar" />
        <KpiCard variant="strip" title="Açık borç" value={d.openPayable} format="money" href="/muhasebe/faturalar" />
        <KpiCard variant="strip" title="Vadesi geçen alacak" value={d.overdueReceivable} format="money" invertDelta href="/muhasebe/faturalar" />
        <KpiCard variant="strip" title="Devreden KDV" value={d.vatCarriedToNext} format="money" hint={d.vatLastPeriod ?? undefined} href="/muhasebe/kdv" />
        <KpiCard variant="strip" title="Eşleşmeyen banka hareketi" value={d.unmatchedBankCount} format="int" invertDelta href="/muhasebe/mutabakat" />
      </KpiStripRow>

      {bankDiffAbs > 0.01 || d.openClosablePeriods > 0 ? (
        <div className="mb-6 space-y-2">
          {bankDiffAbs > 0.01 ? (
            <Link href="/muhasebe/banka" className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-[13px] text-[oklch(0.5_0.14_70)] transition-colors hover:bg-warning/10 dark:text-warning">
              <span>TL banka hesaplarında ekstre/defter farkı var — mutabakat gerekiyor.</span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          ) : null}
          {d.openClosablePeriods > 0 ? (
            <Link href="/muhasebe/donemler" className="flex items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-2.5 text-[13px] text-info transition-colors hover:bg-info/10">
              <span>{d.openClosablePeriods} geçmiş dönem henüz kapatılmadı.</span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="group rounded-lg border border-border/60 p-4 transition-colors hover:border-border hover:bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="font-medium">{l.label}</span>
              <ArrowRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{l.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

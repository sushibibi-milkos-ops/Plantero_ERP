import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, Percent, Truck, ShoppingCart, ReceiptText, Wallet } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getNetRevenueReport } from '@/modules/sales/queries';
import { resolveRange, PERIOD_LABELS, type PeriodKey } from '@/modules/sales/period';
import { NetRevenueChart } from '@/modules/sales/components/net-revenue-chart';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { MoneyCell } from '@/components/money-cell';
import { formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Net Ciro' };
export const dynamic = 'force-dynamic';

const PRESETS: PeriodKey[] = ['bugun', '7g', '30g', 'ay'];

export default async function NetRevenuePage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requirePermission('sales.view');
  const sp = await searchParams;
  const { from, to, period } = resolveRange(sp.period, sp.from, sp.to);
  const report = await getNetRevenueReport(from, to);
  const { current, deltas, breakdown, series, channelCodes } = report;

  return (
    <>
      <PageHeader
        title="Net Ciro"
        description={`${from} → ${to} · kanal komisyonu, kargo ve diğer kesintiler düşülmüş satış geliri`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p}
              href={`/satis/net-ciro?period=${p}`}
              className={cn(
                'inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium',
                period === p ? 'bg-primary text-primary-foreground' : 'border border-border/70 bg-background hover:bg-accent',
              )}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
          <form action="/satis/net-ciro" className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input type="hidden" name="period" value="custom" />
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <input
                type="date"
                name="from"
                lang="tr-TR"
                defaultValue={period === 'custom' ? from : undefined}
                className="h-8 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 text-[13px] sm:w-36 sm:flex-none"
              />
              <span className="shrink-0 text-xs text-muted-foreground">–</span>
              <input
                type="date"
                name="to"
                lang="tr-TR"
                defaultValue={period === 'custom' ? to : undefined}
                className="h-8 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 text-[13px] sm:w-36 sm:flex-none"
              />
            </div>
            <button type="submit" className={cn('inline-flex h-8 w-full items-center justify-center rounded-md px-3 text-[13px] font-medium sm:w-auto', period === 'custom' ? 'bg-primary text-primary-foreground' : 'border border-border/70 bg-background hover:bg-accent')}>
              Uygula
            </button>
          </form>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard title="Brüt ciro" value={current.grossRevenue} format="money" delta={deltas.gross ?? undefined} icon={<Banknote strokeWidth={1.75} />} />
        <KpiCard title="Komisyon" value={current.commission} format="money" delta={deltas.commission ?? undefined} invertDelta icon={<Percent strokeWidth={1.75} />} />
        <KpiCard title="Kargo kesintisi" value={current.shipping} format="money" delta={deltas.shipping ?? undefined} invertDelta icon={<Truck strokeWidth={1.75} />} />
        <KpiCard title="Net ciro" value={current.netRevenue} format="money" delta={deltas.net ?? undefined} icon={<Wallet strokeWidth={1.75} />} className="ring-1 ring-primary/20" />
        <KpiCard title="Sipariş" value={current.orderCount} format="int" delta={deltas.orderCount ?? undefined} icon={<ShoppingCart strokeWidth={1.75} />} />
        <KpiCard title="Ortalama sepet" value={current.avgBasket} format="money" delta={deltas.avgBasket ?? undefined} icon={<ReceiptText strokeWidth={1.75} />} />
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Günlük net ciro (kanal bazlı)</h2>
        {series.length && channelCodes.length ? (
          <NetRevenueChart series={series} channels={channelCodes} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Bu dönemde onaylı sipariş bulunmuyor.</p>
        )}
      </div>

      <div className="mt-4 scrollbar-thin overflow-x-auto rounded-xl border border-border/70 bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
              <th className="sticky left-0 z-10 h-9 bg-muted/40 px-3 text-left font-medium">Kanal</th>
              <th className="h-9 px-3 text-right font-medium">Brüt</th>
              <th className="h-9 px-3 text-right font-medium">Komisyon</th>
              <th className="h-9 px-3 text-right font-medium">Kargo</th>
              <th className="h-9 px-3 text-right font-medium">Diğer</th>
              <th className="h-9 px-3 text-right font-medium">Net</th>
              <th className="h-9 px-3 text-right font-medium">Net marj %</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 ? (
              <tr>
                <td colSpan={7} className="h-16 text-center text-sm text-muted-foreground">Kayıt yok</td>
              </tr>
            ) : (
              breakdown.map((r) => (
                <tr key={r.channelId} className="group h-9 border-b border-border/50 last:border-0 hover:bg-accent/40">
                  <td className="sticky left-0 z-10 bg-card px-3 font-medium group-hover:bg-accent/40">{r.channelName}</td>
                  <td className="px-3"><MoneyCell value={r.gross} /></td>
                  <td className="px-3"><MoneyCell value={r.commission} muted /></td>
                  <td className="px-3"><MoneyCell value={r.shipping} muted /></td>
                  <td className="px-3"><MoneyCell value={r.other} muted /></td>
                  <td className="px-3"><MoneyCell value={r.net} className="font-medium text-foreground" /></td>
                  <td className="px-3 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatPct(r.netMarginPct, 1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

import Link from 'next/link';
import { Wallet } from 'lucide-react';
import type { GmDashboard } from '@plantero/core/cockpit/kpis';
import type { CockpitTodayItem } from '../queries';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { LotBadge } from '@/components/lot-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { formatMoney, formatDateTime, relativeTime } from '@/lib/format';
import { ChannelBars } from './channel-bars';
import { Section, RowLink, ProgressBar, DashboardGrid } from './shared';

const EXPIRY_BUCKET_LABEL: Record<string, string> = { expired: 'Süresi geçti', critical: '< 30 gün', warning: '30-60 gün', notice: '60-90 gün' };

export function GmDashboardView({ data, today }: { data: GmDashboard; today: CockpitTodayItem[] }) {
  const { channelSales, bank, lines, criticalStock, expiry, overdue, breakEven, approvals, activity } = data;

  return (
    <>
      {/* Mobilde en kritik 4 kart üstte — masaüstünde tek KPI şeridi (Stripe dili, kpi-strip.tsx) */}
      <KpiStripRow>
        <KpiCard title="Bugünkü net ciro" value={channelSales.netTotal} format="money" fractionDigits={0} delta={channelSales.netDeltaPct} deltaLabel="dünden" href="/satis/net-ciro" variant="strip" />
        <KpiCard title="Kritik stok kalemi" value={criticalStock.count} format="int" invertDelta href="/satin-alma/kritik-stok" variant="strip" />
        <KpiCard title="Vadesi geçen alacak" value={overdue.aging.totalOverdue} format="money" fractionDigits={0} invertDelta href="/finans/tahsilat-takibi" variant="strip" />
        <KpiCard title="Break-even ilerleme" value={breakEven.progressPct} format="pct" href="/finans/break-even" variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Günlük kanal satışları" href="/satis/net-ciro">
            <div className="grid grid-cols-2 gap-3 border-b border-border/60 p-4">
              <KpiCard title="Brüt (bugün)" value={channelSales.grossTotal} format="money" fractionDigits={0} delta={channelSales.grossDeltaPct} deltaLabel="dünden" sparkline={channelSales.trend7d.map((t) => Number(t.net))} />
              <KpiCard title="Net (bugün)" value={channelSales.netTotal} format="money" fractionDigits={0} delta={channelSales.netDeltaPct} deltaLabel="dünden" />
            </div>
            {channelSales.rows.length === 0 ? (
              <EmptyState compact title="Bugün henüz sipariş yok" description="İlk sipariş girildiğinde kanal çubukları burada görünür." />
            ) : (
              <div className="p-4">
                <ChannelBars rows={channelSales.rows.map((r) => ({ name: r.name, net: Number(r.net) }))} />
              </div>
            )}
          </Section>

          <Section title="Break-even'a uzaklık" href="/finans/break-even">
            <div className="p-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Bu ay gereken (KDV hariç)</span>
                <MoneyCell value={breakEven.targetRevenue} className="text-sm font-medium" />
              </div>
              <div className="mt-1 flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Gerçekleşen net ciro</span>
                <MoneyCell value={breakEven.actualNetRevenue} className="text-sm font-medium" />
              </div>
              <div className="mt-3">
                <ProgressBar pct={Number(breakEven.progressPct)} tone={Number(breakEven.progressPct) >= 100 ? 'success' : 'primary'} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>%{Number(breakEven.progressPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} tamamlandı</span>
                <span>{breakEven.daysRemaining} gün kaldı · günlük {formatMoney(breakEven.dailyPaceNeeded, 'TRY', { digits: 0 })} gerekiyor</span>
              </div>
            </div>
          </Section>

          <Section title="Bugün" href="/satis/siparisler">
            {today.length === 0 ? (
              <EmptyState compact title="Bugün henüz belge yok" description="Sevkiyat, iş emri, mal kabul veya fatura oluştuğunda burada görünür." />
            ) : (
              <ul className="divide-y divide-border/50">
                {today.map((t) => (
                  <li key={`${t.k}-${t.no}`}>
                    <RowLink href={t.href}>
                      <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                        <span className="flex min-w-0 items-center gap-2 sm:contents">
                          <span className="shrink-0 text-xs text-muted-foreground sm:w-20">{t.kind}</span>
                          <span className="truncate font-mono text-xs sm:w-36 sm:shrink-0">{t.no}</span>
                        </span>
                        <span className="shrink-0 sm:order-last"><StatusBadge status={t.status} kind={t.k} /></span>
                      </div>
                      <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                        <span className="min-w-0 flex-1 truncate">{t.partner}</span>
                        <span className="shrink-0">{t.amount !== undefined ? <MoneyCell value={t.amount} /> : <QtyCell value={t.qty} uom={t.uom} />}</span>
                      </div>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Banka" href="/muhasebe/banka">
            <div className="flex h-11 items-center justify-between border-b border-border/60 px-4 text-[13px]">
              <span className="text-muted-foreground">Toplam (TRY hesaplar)</span>
              <MoneyCell value={bank.totalTry} className="font-medium" />
            </div>
            {bank.accounts.length === 0 ? (
              <EmptyState compact title="Banka hesabı yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {bank.accounts.map((a) => (
                  <li key={a.id} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <Wallet className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <span className="min-w-0 truncate">{a.bankName} · {a.code}</span>
                    </span>
                    <MoneyCell value={a.statementBalance} currency={a.currency} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Üretim hatları" href="/uretim/hatlar">
            <ul className="divide-y divide-border/50">
              {lines.map((l) => {
                const planned = Number(l.current?.plannedQty ?? 0);
                const produced = Number(l.current?.producedQty ?? 0);
                const pct = l.current && planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;
                return (
                  <li key={l.lineId}>
                    <RowLink href="/uretim/hatlar" className="flex-col items-stretch sm:h-auto sm:flex-col sm:items-stretch sm:py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{l.name}</span>
                        <span className="flex items-center gap-2">
                          {l.lateCount > 0 ? <StatusBadge status="late" label={`${l.lateCount} gecikmiş`} tone="danger" /> : null}
                          {l.current ? <StatusBadge status={l.current.status} kind="work_order" /> : <StatusBadge status="idle" label="Boşta" tone="muted" />}
                        </span>
                      </div>
                      {l.current && pct > 0 ? (
                        <>
                          <div className="mt-1.5"><ProgressBar pct={pct} /></div>
                          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                            <span className="font-mono">{l.current.docNo}</span>
                            <span className="tabular-nums">%{pct}</span>
                          </div>
                        </>
                      ) : l.current ? (
                        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                          <span className="font-mono">{l.current.docNo}</span>
                          <span>{l.openCount} açık iş emri</span>
                        </div>
                      ) : null}
                    </RowLink>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Kritik stok" href="/satin-alma/kritik-stok">
            {criticalStock.items.length === 0 ? (
              <EmptyState compact title="Kritik stok yok" description="Kapsama süresi tedarik süresinin altına düşen kalemler burada listelenir." />
            ) : (
              <ul className="divide-y divide-border/50">
                {criticalStock.items.map((it) => (
                  <li key={it.productId}>
                    <RowLink href="/satin-alma/kritik-stok">
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{it.warehouseCode} · {it.leadTimeDays}g tedarik</span>
                      <QtyCell value={it.daysOfCover} uom="gün kapsama" className="shrink-0" />
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="SKT riski" href="/depo/skt">
            <div className="grid grid-cols-4 divide-x divide-border/60 border-b border-border/60">
              {(['expired', 'critical', 'warning', 'notice'] as const).map((b) => (
                <div key={b} className="px-2 py-2.5 text-center">
                  <div className="text-[15px] font-semibold tabular-nums">{expiry.totals[b].count}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{EXPIRY_BUCKET_LABEL[b]}</div>
                </div>
              ))}
            </div>
            {expiry.top5.length === 0 ? (
              <EmptyState compact title="Yaklaşan SKT yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {expiry.top5.map((r) => (
                  <li key={r.quantId}>
                    <RowLink href={`/depo/lotlar/${r.lotId}`}>
                      <span className="flex min-w-0 items-center gap-2 sm:contents">
                        <LotBadge lotNo={r.lotNo} status="released" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.productName}</span>
                      <ExpiryBadge date={new Date(`${r.expiryDate}T00:00:00Z`)} showDate={false} className="shrink-0" />
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Geciken alacak" href="/finans/tahsilat-takibi">
            <div className="grid grid-cols-4 divide-x divide-border/60 border-b border-border/60 text-center text-[11px]">
              {([['0-30', overdue.aging.b0_30], ['31-60', overdue.aging.b31_60], ['61-90', overdue.aging.b61_90], ['90+', overdue.aging.b90plus]] as const).map(([label, v]) => (
                <div key={label} className="px-2 py-2.5">
                  <div className="num text-[13px] font-semibold tabular-nums">{formatMoney(v, 'TRY', { digits: 0 })}</div>
                  <div className="mt-0.5 text-muted-foreground">{label} gün</div>
                </div>
              ))}
            </div>
            {overdue.top5.length === 0 ? (
              <EmptyState compact title="Vadesi geçen alacak yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {overdue.top5.map((inv) => (
                  <li key={inv.id}>
                    <RowLink href="/finans/tahsilat-takibi">
                      <span className="min-w-0 flex-1 truncate">{inv.partnerName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{inv.daysOverdue} gün</span>
                      <MoneyCell value={inv.residual} className="shrink-0" />
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Onay kuyruğu" href="/onaylar">
            {approvals.total === 0 ? (
              <EmptyState compact title="Onay bekleyen öğe yok" />
            ) : (
              <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
                {([
                  ['AI satın alma', approvals.purchaseDrafts, '/satin-alma/onay-kuyrugu'],
                  ['Mutabakat', approvals.reconciliation, '/muhasebe/mutabakat'],
                  ['Sayım farkı', approvals.countVariance, '/depo/sayim'],
                  ['Hatırlatma', approvals.dunning, '/finans/tahsilat-takibi'],
                ] as const).map(([label, n, href]) => (
                  <Link key={label} href={href} className="flex flex-col items-center justify-center gap-1 bg-card px-2 py-3 hover:bg-muted/40">
                    <span className="text-[17px] font-semibold tabular-nums">{n}</span>
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* href yok: /ayarlar/audit (Denetim Kaydı) henüz inşa edilmedi (ayarlar modülü kapsamı) —
              var olmayan bir rotaya "Tümü" bağlantısı vermek yerine burada başlıksız bırakılır. */}
          <Section title="Son aktiviteler">
            {activity.length === 0 ? (
              <EmptyState compact title="Henüz aktivite yok" />
            ) : (
              <ul className="divide-y divide-border/50">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-muted-foreground">{a.userName ?? 'Sistem'}</span>
                      {a.summary ? <span> · {a.summary}</span> : <span> · {a.action} · {a.tableName}</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground" title={formatDateTime(a.at)}>{relativeTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </DashboardGrid>
    </>
  );
}

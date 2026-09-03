import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, ShoppingCart, AlertTriangle, Clock, Factory, CalendarClock, CheckSquare, ArrowRight, Wallet } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { StatusBadge } from '@/components/status-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { LotBadge } from '@/components/lot-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDateLong } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getCockpitApprovals, getCockpitExpiringLots, getCockpitKpis, getCockpitLineCards, getCockpitReceivablesToday, getCockpitToday } from '@/modules/kokpit/queries';

export const metadata: Metadata = { title: 'Kokpit' };
export const dynamic = 'force-dynamic';

function Section({ title, href, children, className }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-border/70 bg-card', className)}>
      <header className="flex h-11 items-center justify-between border-b border-border/60 px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Tümü <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Saate göre selamlama — akşam saatlerinde "Günaydın" göstermemek için (Europe/Istanbul). */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour < 6) return 'İyi geceler';
  if (hour < 11) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

export default async function CockpitPage() {
  const user = await requirePermission('cockpit.view');
  const first = user.fullName.split(' ')[0];

  const [kpis, today, expiring, approvals, receivables, lines] = await Promise.all([
    getCockpitKpis(),
    getCockpitToday(),
    getCockpitExpiringLots(),
    getCockpitApprovals(),
    getCockpitReceivablesToday(),
    getCockpitLineCards(),
  ]);

  const KPIS: Array<{ title: string; value: number | string; format: 'money' | 'int'; delta: number | null; sparkline?: number[]; icon: typeof Banknote; href: string; hint?: string }> = [
    { title: 'Bugünkü ciro', value: kpis.revenueToday, format: 'money', delta: kpis.revenueDeltaPct, sparkline: kpis.revenueSparkline.length > 1 ? kpis.revenueSparkline : undefined, icon: Banknote, href: '/satis/net-ciro' },
    { title: 'Açık siparişler', value: kpis.openOrders, format: 'int', delta: null, icon: ShoppingCart, href: '/satis/siparisler', hint: kpis.readyToShip > 0 ? `${kpis.readyToShip} sevkiyata hazır` : undefined },
    { title: 'Kritik stok kalemi', value: kpis.criticalStockCount, format: 'int', delta: null, icon: AlertTriangle, href: '/satin-alma/kritik-stok' },
    { title: 'Vadesi geçen alacak', value: kpis.overdueReceivable, format: 'money', delta: null, icon: Clock, href: '/finans/tahsilat-takibi' },
  ];

  return (
    <>
      <PageHeader eyebrow={`${greeting()}, ${first}`} title="Kokpit" description={`${formatDateLong(new Date())} · Tire tesisi özeti`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k, i) => (
          <div key={k.title} className="enter-up" style={{ animationDelay: `${i * 40}ms` }}>
            <KpiCard
              title={k.title}
              value={k.value}
              format={k.format}
              delta={k.delta}
              sparkline={k.sparkline}
              icon={<k.icon strokeWidth={1.75} />}
              href={k.href}
              hint={k.hint}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Bugün" href="/satis/siparisler" className="lg:col-span-2">
          {today.length === 0 ? (
            <EmptyState compact title="Bugün henüz belge yok" description="Sevkiyat, iş emri, mal kabul veya fatura oluştuğunda burada görünür." />
          ) : (
            <ul className="divide-y divide-border/50">
              {today.map((t) => (
                <li key={`${t.k}-${t.no}`} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:h-11 sm:flex-row sm:items-center sm:gap-3 sm:py-0">
                  <div className="flex items-center justify-between gap-3 sm:contents">
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <span className="shrink-0 text-xs text-muted-foreground sm:w-20">{t.kind}</span>
                      <Link href={t.href} className="truncate font-mono text-xs hover:underline sm:w-36 sm:shrink-0">{t.no}</Link>
                    </span>
                    <span className="shrink-0 sm:order-last">
                      <StatusBadge status={t.status} kind={t.k} />
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                    <span className="min-w-0 flex-1 truncate">{t.partner}</span>
                    <span className="shrink-0">{t.amount !== undefined ? <MoneyCell value={t.amount} /> : <QtyCell value={t.qty} uom={t.uom} />}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Onay kuyruğu" href="/satin-alma/onay-kuyrugu">
          {approvals.length === 0 ? (
            <EmptyState compact title="Onay bekleyen öğe yok" description="AI taslakları ve mutabakat önerileri burada listelenir." />
          ) : (
            <ul className="divide-y divide-border/50">
              {approvals.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                  <CheckSquare className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <Link href={a.href} className="line-clamp-2 hover:underline">{a.title}</Link>
                    {a.confidence !== null ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">AI güveni %{Math.round(a.confidence * 100)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="SKT yaklaşan lotlar" href="/depo/skt" className="lg:col-span-2">
          {expiring.length === 0 ? (
            <EmptyState compact title="Yaklaşan SKT yok" description="Serbest, elde miktarı olan lotlardan SKT'si en yakın olanlar burada listelenir." />
          ) : (
            <ul className="divide-y divide-border/50">
              {expiring.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:h-11 sm:flex-row sm:items-center sm:gap-3 sm:py-0">
                  <div className="flex items-center justify-between gap-3 sm:contents">
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <CalendarClock className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <LotBadge lotNo={e.lotNo} status="released" />
                    </span>
                    <span className="shrink-0 sm:order-last">
                      <ExpiryBadge date={new Date(`${e.expiryDate}T00:00:00Z`)} showDate={false} />
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                    <span className="min-w-0 flex-1 truncate">{e.product}</span>
                    <QtyCell value={e.qty} uom={e.uom} className="shrink-0" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Üretim" href="/uretim/is-emirleri">
          <div className="space-y-3 p-4 text-[13px]">
            {lines.map((l) => {
              const planned = Number(l.activeWorkOrder?.plannedQty ?? 0);
              const produced = Number(l.activeWorkOrder?.producedQty ?? 0);
              const pct = l.activeWorkOrder && planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;
              return (
                <div key={l.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Factory className="size-4 text-muted-foreground" strokeWidth={1.75} /> {l.name}
                    </span>
                    {l.activeWorkOrder ? <StatusBadge status={l.activeWorkOrder.status} kind="work_order" /> : <span className="text-xs text-muted-foreground">Boşta</span>}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span className="font-mono">{l.activeWorkOrder?.docNo ?? '—'}</span>
                    <span className="tabular-nums">%{pct}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Bugünün tahsilatları" href="/finans/tahsilat-takibi" className="lg:col-start-3">
          {receivables.length === 0 ? (
            <EmptyState compact title="Bugün tahsilat yok" description="Bugün alınan tahsilatlar burada listelenir." />
          ) : (
            <ul className="divide-y divide-border/50">
              {receivables.map((r) => (
                <li key={r.id} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Wallet className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="min-w-0 truncate">{r.partnerName}</span>
                  </span>
                  <MoneyCell value={r.amount} className="shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

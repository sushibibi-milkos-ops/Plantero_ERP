import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, ShoppingCart, AlertTriangle, Clock, Factory, CalendarClock, CheckSquare, ArrowRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { StatusBadge } from '@/components/status-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { LotBadge } from '@/components/lot-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatDateLong } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Kokpit' };

/**
 * Kokpit yer tutucusu: gerçek KPI kartı düzeni; veriler modüller yayınlanana dek sabit.
 * Her kart ilgili modül sayfasına bağlanır.
 */
const KPIS = [
  { title: 'Bugünkü ciro', value: '184250.00', format: 'money', delta: 8.4, sparkline: [120, 132, 128, 150, 141, 162, 184], icon: Banknote, href: '/satis/net-ciro' },
  { title: 'Açık siparişler', value: 37, format: 'int', delta: -5.1, sparkline: [42, 44, 40, 39, 41, 38, 37], icon: ShoppingCart, href: '/satis/siparisler', hint: '12 sevkiyata hazır' },
  { title: 'Kritik stok kalemi', value: 6, format: 'int', delta: 20, invertDelta: true, icon: AlertTriangle, href: '/satin-alma/kritik-stok' },
  { title: 'Vadesi geçen alacak', value: '412780.50', format: 'money', delta: -12.3, invertDelta: true, sparkline: [520, 498, 470, 455, 440, 430, 412], icon: Clock, href: '/finans/tahsilat-takibi' },
] as const;

const TODAY = [
  { kind: 'Sevkiyat', no: 'DN-2026-000214', partner: 'Migros Ticaret A.Ş.', status: 'picking', k: 'delivery' as const, amount: '58420.00' },
  { kind: 'İş emri', no: 'WO-2026-000088', partner: 'Hat 1 · Nohut Cipsi 40g', status: 'in_progress', k: 'work_order' as const, qty: '1200', uom: 'kg' },
  { kind: 'Mal kabul', no: 'GR-2026-000131', partner: 'Ege Baklagil San.', status: 'qc_pending', k: 'receipt' as const, qty: '2500', uom: 'kg' },
  { kind: 'Fatura', no: 'INV-2026-000502', partner: 'Trendyol (hakediş)', status: 'posted', k: 'invoice' as const, amount: '31240.80' },
];

const EXPIRING = [
  { lot: 'PL-260611-H1-02', product: 'Mercimek Cipsi 40g', qty: '860', days: 22 },
  { lot: 'PL-260702-H2-01', product: 'Nohut Cipsi 40g', qty: '1420', days: 47 },
  { lot: 'TD-2601-0093', product: 'Ayçiçek Yağı (rafine)', qty: '310', days: 74 },
];

const APPROVALS = [
  { title: 'AI satın alma taslağı · Kırmızı mercimek 5 t', kind: 'purchase_draft', confidence: 0.86 },
  { title: 'Mutabakat önerisi · Ziraat 14.250,00 ₺ → INV-2026-000488', kind: 'reconciliation', confidence: 0.93 },
  { title: 'Sayım farkı · Depo A raf 12 (−18 kg)', kind: 'count_variance', confidence: null },
];

function Section({ title, href, children, className }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border/70 bg-card', className)}>
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

export default async function CockpitPage() {
  const user = await requirePermission('cockpit.view');
  const first = user.fullName.split(' ')[0];
  const dayOffset = (d: number) => new Date(Date.now() + d * 86_400_000);

  return (
    <>
      <PageHeader title={`Günaydın, ${first}`} description={`${formatDateLong(new Date())} · Tire tesisi özeti`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k, i) => (
          <div key={k.title} className="enter-up" style={{ animationDelay: `${i * 40}ms` }}>
            <KpiCard
              title={k.title}
              value={k.value}
              format={k.format}
              delta={k.delta}
              invertDelta={'invertDelta' in k ? k.invertDelta : false}
              sparkline={'sparkline' in k ? [...k.sparkline] : undefined}
              icon={k.icon}
              href={k.href}
              hint={'hint' in k ? k.hint : undefined}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Bugün" href="/satis/siparisler" className="lg:col-span-2">
          <ul className="divide-y divide-border/50">
            {TODAY.map((t) => (
              <li key={t.no} className="flex h-11 items-center gap-3 px-4 text-[13px]">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{t.kind}</span>
                <span className="w-36 shrink-0 font-mono text-xs">{t.no}</span>
                <span className="min-w-0 flex-1 truncate">{t.partner}</span>
                <span className="hidden sm:inline">
                  {'amount' in t ? <MoneyCell value={t.amount} /> : <QtyCell value={t.qty} uom={t.uom} />}
                </span>
                <StatusBadge status={t.status} kind={t.k} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Onay kuyruğu" href="/satin-alma/onay-kuyrugu">
          <ul className="divide-y divide-border/50">
            {APPROVALS.map((a) => (
              <li key={a.title} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                <CheckSquare className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{a.title}</span>
                  {a.confidence !== null ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">AI güveni %{Math.round(a.confidence * 100)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="SKT yaklaşan lotlar" href="/depo/skt" className="lg:col-span-2">
          <ul className="divide-y divide-border/50">
            {EXPIRING.map((e) => (
              <li key={e.lot} className="flex h-11 items-center gap-3 px-4 text-[13px]">
                <CalendarClock className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <LotBadge lotNo={e.lot} status="released" />
                <span className="min-w-0 flex-1 truncate">{e.product}</span>
                <QtyCell value={e.qty} uom="adet" className="hidden sm:inline-flex" />
                <ExpiryBadge date={dayOffset(e.days)} showDate={false} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Üretim" href="/uretim/is-emirleri">
          <div className="space-y-3 p-4 text-[13px]">
            {[
              { line: 'Hat 1', wo: 'WO-2026-000088', pct: 64, status: 'in_progress' },
              { line: 'Hat 2', wo: 'WO-2026-000089', pct: 0, status: 'planned' },
            ].map((l) => (
              <div key={l.line}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Factory className="size-4 text-muted-foreground" strokeWidth={1.75} /> {l.line}
                  </span>
                  <StatusBadge status={l.status} kind="work_order" />
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${l.pct}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span className="font-mono">{l.wo}</span>
                  <span className="tabular-nums">%{l.pct}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

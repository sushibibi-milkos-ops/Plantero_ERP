import type { WarehouseCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { formatMoney } from '@/lib/format';
import { Section } from './shared';

const EXPIRY_BUCKET_LABEL: Record<string, string> = { expired: 'Süresi geçti', critical: '< 30 gün', warning: '30-60 gün', notice: '60-90 gün' };

/** Depo rolü panosu — büyük dokunma hedefleri (KpiCard strip zaten 72/80px), tek amaca odaklı sayaçlar. */
export function DepoDashboardView({ data }: { data: WarehouseCards }) {
  return (
    <>
      <KpiStripRow>
        <KpiCard title="Mal kabul bekleyen" value={data.receiptsPending} format="int" href="/depo/mal-kabul" invertDelta variant="strip" />
        <KpiCard title="Sevk bekleyen" value={data.deliveriesPending} format="int" href="/depo/sevkiyat" invertDelta variant="strip" />
        <KpiCard title="Açık sayım" value={data.countsOpen} format="int" href="/depo/sayim" invertDelta variant="strip" />
        <KpiCard title="Karantinada" value={data.quarantine.count} format="int" href="/depo/lotlar" invertDelta variant="strip" />
      </KpiStripRow>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <Section title="Karantina değeri" href="/depo/lotlar">
          <div className="flex h-16 items-center justify-between px-4">
            <span className="text-sm text-muted-foreground">{data.quarantine.count} lot bekliyor</span>
            <span className="num text-lg font-semibold tabular-nums">{formatMoney(data.quarantine.value, 'TRY', { digits: 0 })}</span>
          </div>
        </Section>

        <Section title="SKT riski" href="/depo/skt">
          <div className="grid grid-cols-4 divide-x divide-border/60">
            {(['expired', 'critical', 'warning', 'notice'] as const).map((b) => (
              <div key={b} className="px-2 py-3 text-center">
                <div className="text-[17px] font-semibold tabular-nums">{data.expiry[b].count}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{EXPIRY_BUCKET_LABEL[b]}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

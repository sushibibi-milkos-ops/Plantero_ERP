import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { MaintenanceCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Section, RowLink } from './shared';

/** Bakım panosu — durmuş makineler, bugünkü bakım iş emri sayısı, bugünkü ortalama OEE. */
export function MaintenanceDashboardView({ data }: { data: MaintenanceCards }) {
  return (
    <>
      <KpiStripRow>
        <KpiCard title="Durmuş makine" value={data.downMachines.length} format="int" href="/bakim/makineler" invertDelta variant="strip" />
        <KpiCard title="Bugünkü bakım" value={data.todayMaintenanceCount} format="int" href="/bakim/is-emirleri" variant="strip" />
        <KpiCard title="Bugünkü OEE" value={data.todayOeePct} format="pct" href="/bakim/oee" variant="strip" />
      </KpiStripRow>

      <div className="mt-4">
        <Section title="Durmuş makineler" href="/bakim/makineler">
          {data.downMachines.length === 0 ? (
            // Kök neden (Tur 6 P1 kokpit-depo-empty-action-04, aynı desen).
            <EmptyState
              compact
              title="Durmuş makine yok"
              description="Bir makine arızalanıp durduğunda burada listelenir."
              action={
                <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                  <Link href="/bakim/is-emirleri/yeni"><Plus className="size-3.5" /> Arıza bildir</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {data.downMachines.map((m) => (
                <li key={m.id}>
                  <RowLink href="/bakim/makineler">
                    <span className="min-w-0 flex-1 truncate">{m.name} <span className="text-muted-foreground">· {m.code}</span></span>
                    <StatusBadge status="down" kind="machine" />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {m.downSinceMinutes === null ? '—' : m.downSinceMinutes < 60 ? `${m.downSinceMinutes} dk` : `${Math.round(m.downSinceMinutes / 60)} sa`}
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

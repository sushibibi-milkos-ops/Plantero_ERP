import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatQty, formatPct } from '@/lib/format';
import { BOM_STATUS_LABELS } from '../product-labels';
import type { schema } from '@plantero/db';

type BomRow = (typeof schema.boms.$inferSelect);

export function ProductBomTab({ boms, unitCosts }: { boms: BomRow[]; unitCosts: Record<string, string> }) {
  if (boms.length === 0) {
    return <EmptyState compact title="Reçete tanımlı değil" description="Bu ürün için henüz bir BOM (reçete) oluşturulmamış." />;
  }
  const active = boms.find((b) => b.status === 'active');

  return (
    <div className="space-y-4">
      {active ? (
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] tracking-wide text-muted-foreground uppercase">Aktif reçete</div>
              <div className="mt-0.5 font-mono text-sm">{active.code}</div>
            </div>
            <Button href={`/ana-veri/receteler/${active.id}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-6 text-[13px]">
            <div>
              <span className="text-muted-foreground">Çıktı: </span>
              {formatQty(active.outputQty)} · verim {formatPct(active.expectedYieldPct)}
            </div>
            <div>
              <span className="text-muted-foreground">Birim maliyet: </span>
              <MoneyCell value={unitCosts[active.id] ?? '0'} className="font-semibold" />
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-sm font-medium">Versiyon geçmişi</div>
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-medium">Kod</th>
                  <th className="h-9 px-3 text-left font-medium">Versiyon</th>
                  <th className="h-9 px-3 text-left font-medium">Durum</th>
                  <th className="h-9 px-3 text-right font-medium">Birim Maliyet</th>
                  <th className="h-9 px-3" />
                </tr>
              </thead>
              <tbody>
                {boms.map((b) => (
                  <tr key={b.id} className="h-9 border-b border-border/50 last:border-0">
                    <td className="px-3 font-mono text-[12px]">{b.code}</td>
                    <td className="px-3">v{b.version}</td>
                    <td className="px-3">
                      <StatusBadge status={b.status} label={BOM_STATUS_LABELS[b.status] ?? b.status} kind="bom" />
                    </td>
                    <td className="px-3 text-right">
                      <MoneyCell value={unitCosts[b.id] ?? '0'} muted />
                    </td>
                    <td className="px-3 text-right">
                      <Link href={`/ana-veri/receteler/${b.id}`} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
                        Aç <ArrowRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Button({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-3 text-[13px] font-medium hover:bg-accent">
      Reçeteyi aç <ArrowRight className="size-3.5" />
    </Link>
  );
}

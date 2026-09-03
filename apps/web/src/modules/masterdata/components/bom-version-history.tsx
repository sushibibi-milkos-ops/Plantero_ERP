import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { cn } from '@/lib/utils';
import { BOM_STATUS_LABELS } from '../product-labels';

export type VersionRow = { id: string; code: string; version: number; status: string; unitCost: string };

export function BomVersionHistory({ versions, currentId }: { versions: VersionRow[]; currentId: string }) {
  if (versions.length <= 1) return null;
  return (
    <div>
      <div className="mb-2 text-sm font-medium">Versiyon geçmişi</div>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                <th className="h-9 px-3 text-left font-medium">Kod</th>
                <th className="h-9 px-3 text-left font-medium">Durum</th>
                <th className="h-9 px-3 text-right font-medium">Birim Maliyet</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className={cn('h-9 border-b border-border/50 last:border-0', v.id === currentId && 'bg-accent/40')}>
                  <td className="px-3">
                    <Link href={`/ana-veri/receteler/${v.id}`} className="font-mono text-[12px] hover:underline">
                      {v.code}
                    </Link>
                    {v.id === currentId ? <span className="ml-2 text-[11px] text-muted-foreground">(bu sayfa)</span> : null}
                  </td>
                  <td className="px-3">
                    <StatusBadge status={v.status} label={BOM_STATUS_LABELS[v.status] ?? v.status} kind="bom" />
                  </td>
                  <td className="px-3 text-right">
                    <MoneyCell value={v.unitCost} muted />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { ListOrdered } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { formatDate } from '@/lib/format';
import type { LineQueueRow } from '../queries';

/**
 * Aynı hatta birden fazla açık iş emri aynı öncelik kademesinde olabilir (ör. iki `released` —
 * planlamacı art arda iki iş emrini serbest bıraktığında). Bu durumda hangisinin "aktif" sayılacağı
 * belirsizdir; eskiden `getActiveWorkOrderForLine` sorgunun keyfi dönüş sırasına göre birini
 * sessizce seçiyordu ve operatör yanlış iş emrine karşı lot okutup üretim/fire girebiliyordu
 * (Tur 3 bulgusu, P0 — lot geri izleme ve belge/miktar zinciri riski). Bunun yerine kuyruk
 * listelenir, operatör açıkça hangisiyle çalışacağını seçer.
 */
export function WorkOrderQueue({ lineId, lineName, queue }: { lineId: string; lineName: string; queue: LineQueueRow[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-5xl">
      <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/[0.05] p-3 text-sm text-[oklch(0.5_0.14_70)] dark:text-warning">
        <ListOrdered className="size-4 shrink-0" />
        <p>
          <span className="font-medium">{lineName}</span> hattında <strong className="num">{queue.length}</strong> açık iş emri var — çalışacağınızı seçin.
        </p>
      </div>
      <div className="space-y-2">
        {queue.map((wo) => (
          <Link
            key={wo.id}
            href={`/operator/${lineId}/${wo.id}`}
            data-pressable
            className="flex min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-card p-4 transition-transform active:scale-[0.99] active:bg-accent/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{wo.docNo}</span>
                <StatusBadge status={wo.status} kind="work_order" size="sm" />
              </div>
              <div className="mt-0.5 truncate text-base font-medium">{wo.productName}</div>
              {wo.plannedStart ? <div className="mt-0.5 text-xs text-muted-foreground">Planlanan {formatDate(wo.plannedStart)}</div> : null}
            </div>
            <QtyCell value={wo.plannedQty} uom={wo.uomCode} className="shrink-0 text-base" />
          </Link>
        ))}
      </div>
    </div>
  );
}

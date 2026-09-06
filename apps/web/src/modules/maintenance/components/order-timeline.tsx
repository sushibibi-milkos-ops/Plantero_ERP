import { formatDateTime } from '@/lib/format';
import { getStatusInfo } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { MaintenanceOrderEvent } from '../queries';

const DOT_CLASS: Record<string, string> = {
  neutral: 'bg-foreground/50', muted: 'bg-muted-foreground/60', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', primary: 'bg-primary',
};

/**
 * Kriter 3 (Tur 2 P1 bakim-isemirleri-detay-04) kök neden düzeltmesi: iş emrinin durumu eskiden
 * yalnızca TEK bir rozetle temsil ediliyordu — "bildirildi → işleme alındı → parça bekliyor →
 * tamamlandı" geçişleri (kim, ne zaman) hiçbir yerde görünmüyordu. Kart/çerçeve YOK (kutu enflasyonu
 * bulgusuna — detay-08 — katkı yapmasın diye) — Stripe/Linear'daki gibi ince dikey çizgili düz liste.
 */
export function OrderTimeline({ events }: { events: MaintenanceOrderEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div>
      <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Olay geçmişi</h2>
      <ol className="space-y-4 border-l border-border/60 pl-4">
        {events.map((e) => {
          const info = getStatusInfo(e.status, 'maintenance');
          return (
            <li key={e.id} className="relative">
              <span aria-hidden className={cn('absolute top-1 -left-[18.5px] size-2.5 rounded-full ring-4 ring-background', DOT_CLASS[info.tone] ?? DOT_CLASS.neutral)} />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-medium">{info.label}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{formatDateTime(e.at)}</span>
              </div>
              {e.userName ? <div className="text-[12px] text-muted-foreground">{e.userName}</div> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

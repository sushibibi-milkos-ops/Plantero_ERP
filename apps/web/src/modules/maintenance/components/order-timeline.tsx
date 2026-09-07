import { formatDateTime } from '@/lib/format';
import { getStatusInfo } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { MaintenanceOrderEvent } from '../queries';

const DOT_CLASS: Record<string, string> = {
  neutral: 'bg-foreground/50', muted: 'bg-muted-foreground/60', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', primary: 'bg-primary',
};

// Kriter 4 (Tur 10 P2 bakim-isemirleri-detay-12) kök neden düzeltmesi: "Yapılıyor" (maintenance.
// in_progress → tone primary) ve "Tamamlandı" (maintenance.done → tone success) globals.css'te aynı
// yeşil ailedendir (hue ~152, Δhue 0) — dolgulu haldeyken renk kanalı zaman çizgisinde ayırt edici
// bilgi taşımıyordu (probe-bakim-r10d.ts: ΔL yalnızca 0,05). status-badge.tsx'teki work_order
// desenine paralel bir çözüm (tonu DEĞİŞTİRMEDEN, yalnızca bu modül dosyasında): devam eden durum
// dolgulu + nabız atan noktayla, tamamlanmış durum dolgusuz/içi boş halkayla ayrılır — artık iki
// bitişik nokta arasındaki fark renkten bağımsız olarak (anatomi) ölçülebilir.
const HOLLOW_STATUSES = new Set(['done']);
const PULSE_STATUSES = new Set(['in_progress']);
const RING_BORDER_CLASS: Record<string, string> = {
  neutral: 'border-foreground/50', muted: 'border-muted-foreground/60', info: 'border-info', success: 'border-success', warning: 'border-warning', danger: 'border-destructive', primary: 'border-primary',
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
          const hollow = HOLLOW_STATUSES.has(e.status ?? '');
          const pulse = PULSE_STATUSES.has(e.status ?? '');
          return (
            <li key={e.id} className="relative">
              <span
                aria-hidden
                className={cn(
                  'absolute top-1 -left-[18.5px] size-2.5 rounded-full ring-4 ring-background',
                  hollow
                    ? cn('border-2 bg-background', RING_BORDER_CLASS[info.tone] ?? RING_BORDER_CLASS.neutral)
                    : cn(DOT_CLASS[info.tone] ?? DOT_CLASS.neutral, pulse && 'motion-safe:animate-pulse'),
                )}
              />
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

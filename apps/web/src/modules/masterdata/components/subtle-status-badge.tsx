import { cn } from '@/lib/utils';

/**
 * Dolgusuz durum rozeti: yalnızca 6px nokta + 11px metin, dolgu/arka plan yok —
 * `status-badge.tsx`'teki `work_order` "subtle" desenine denk (Tur 4 P1 bulgusu: paylaşılan
 * `StatusBadge` bu varyantı yalnızca `kind === 'work_order'` için üretiyor; ortak dosya
 * değiştirilmediği için burada modül-yerel olarak tekrarlanır, bkz. rapor "sharedComponentRequests").
 * Sık/olağan bir durumu (ör. "Aktif") sütun boyunca kesintisiz renkli şerit yapmadan taşımak için —
 * dolgulu rozet yalnızca istisnai durumlara (iptal, red, çakışma…) ayrılır.
 */
const TONE_TEXT = {
  success: 'text-success',
  muted: 'text-muted-foreground',
  neutral: 'text-foreground/80',
  warning: 'text-[oklch(0.5_0.14_70)] dark:text-warning',
  danger: 'text-destructive',
  info: 'text-info',
  primary: 'text-primary',
} as const;

const TONE_DOT = {
  success: 'bg-success',
  muted: 'bg-muted-foreground/60',
  neutral: 'bg-foreground/50',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  primary: 'bg-primary',
} as const;

export type SubtleTone = keyof typeof TONE_TEXT;

export function SubtleStatusBadge({ tone, label }: { tone: SubtleTone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-transparent px-2 text-[11px] font-medium whitespace-nowrap',
        TONE_TEXT[tone],
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
      {label}
    </span>
  );
}

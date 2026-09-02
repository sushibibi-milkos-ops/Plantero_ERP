import { cn } from '@/lib/utils';
import { daysUntil, formatDate } from '@/lib/format';

export type ExpiryLevel = 'ok' | 'notice' | 'warning' | 'critical' | 'expired' | 'none';

/** 30/60/90 kuralı: >90 nötr, 60–90 sarı, 30–60 turuncu, <30 kırmızı, geçmiş koyu kırmızı */
export function expiryLevel(days: number | null): ExpiryLevel {
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days < 30) return 'critical';
  if (days < 60) return 'warning';
  if (days < 90) return 'notice';
  return 'ok';
}

const LEVEL_CLASS: Record<ExpiryLevel, string> = {
  none: 'bg-muted/60 text-muted-foreground',
  ok: 'bg-muted text-foreground/75',
  notice: 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning',
  warning: 'bg-[oklch(0.7_0.18_50)]/15 text-[oklch(0.5_0.17_45)] dark:text-[oklch(0.78_0.16_55)]',
  critical: 'bg-destructive/10 text-destructive',
  expired: 'bg-destructive text-destructive-foreground',
};

export const EXPIRY_LEVEL_LABELS: Record<ExpiryLevel, string> = {
  none: 'SKT yok',
  ok: '90+ gün',
  notice: '60–90 gün',
  warning: '30–60 gün',
  critical: '30 günden az',
  expired: 'SKT geçti',
};

/**
 * SKT rozeti: kalan gün + tarih. `now` test için enjekte edilebilir.
 */
export function ExpiryBadge({
  date,
  now,
  showDate = true,
  className,
}: {
  date: Date | string | null | undefined;
  now?: Date;
  showDate?: boolean;
  className?: string;
}) {
  const days = daysUntil(date, now);
  const level = expiryLevel(days);
  let text: string;
  if (level === 'none') text = 'SKT yok';
  else if (level === 'expired') text = days === 0 ? 'Bugün doldu' : `${Math.abs(days!)} gün önce doldu`;
  else if (days === 0) text = 'Bugün son gün';
  else text = `${days} gün`;

  return (
    <span
      data-expiry-level={level}
      title={date ? `SKT: ${formatDate(date)}` : undefined}
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap tabular-nums',
        LEVEL_CLASS[level],
        className,
      )}
    >
      {text}
      {showDate && date && level !== 'none' ? <span className="opacity-70">· {formatDate(date)}</span> : null}
    </span>
  );
}

import { cn } from '@/lib/utils';
import { getStatusInfo, type StatusKind, type StatusTone } from '@/lib/status';

const TONE_CLASSES: Record<StatusTone, { badge: string; dot: string }> = {
  neutral: { badge: 'bg-muted text-foreground/80 border-transparent', dot: 'bg-foreground/50' },
  muted: { badge: 'bg-muted/60 text-muted-foreground border-transparent', dot: 'bg-muted-foreground/60' },
  info: { badge: 'bg-info/10 text-info border-transparent', dot: 'bg-info' },
  success: { badge: 'bg-success/12 text-success border-transparent', dot: 'bg-success' },
  warning: { badge: 'bg-warning/15 text-[oklch(0.5_0.14_70)] border-transparent dark:text-warning', dot: 'bg-warning' },
  danger: { badge: 'bg-destructive/10 text-destructive border-transparent', dot: 'bg-destructive' },
  primary: { badge: 'bg-primary/10 text-primary border-transparent', dot: 'bg-primary' },
};

/**
 * Durum rozeti: sözlükten TR etiket + ton. Nokta + metin (Linear tarzı), 20px yükseklik.
 * `kind` verilirse enuma özel etiket kullanılır; `label` ile ezilebilir.
 */
export function StatusBadge({
  status,
  kind,
  label,
  tone,
  size = 'sm',
  dot = true,
  className,
}: {
  status: string | null | undefined;
  kind?: StatusKind;
  label?: string;
  tone?: StatusTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}) {
  const info = getStatusInfo(status, kind);
  const t = TONE_CLASSES[tone ?? info.tone];
  return (
    <span
      data-status={status ?? ''}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        t.badge,
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', t.dot)} /> : null}
      {label ?? info.label}
    </span>
  );
}

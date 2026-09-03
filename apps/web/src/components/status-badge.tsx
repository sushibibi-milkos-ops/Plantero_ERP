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

/** `emphasis="subtle"` metin/nokta rengini korur ama dolguyu kaldırır (bkz. work_order özel durumu aşağıda). */
const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-foreground/80',
  muted: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-[oklch(0.5_0.14_70)] dark:text-warning',
  danger: 'text-destructive',
  primary: 'text-primary',
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
  const resolvedTone = tone ?? info.tone;
  const t = TONE_CLASSES[resolvedTone];
  // `work_order` özel durumu: in_progress (primary) ve finished (success) globals.css'te aynı yeşil
  // aileden (hue 152) olduğundan dolgulu haldeyken göz için neredeyse ayırt edilemez — 8 satırlık bir
  // listede "hangisi hâlâ çalışıyor" sorusu renkle cevaplanamıyordu (Tur 2 bulgusu). Devam eden süreç
  // dolgulu + nabız atan noktayla vurgulanır; tamamlanmış süreç dolgusuz (yalnızca metin + nokta) kalır
  // — aynı listede iki durum artık asla aynı arka plan rengini paylaşmaz.
  //
  // `delivery` kind'ında aynı kalıp: "Sevk edildi" ve "Teslim edildi" artık ikisi de `success`
  // (Tur 4 P1 — ton sözlüğü anlam eksenine sabitlendi, bkz. lib/status.ts) ama ayrı, ardışık iki
  // adım — aynı satırda ikisi de dolgulu yeşil görünürse ayırt edilemez. "Sevk edildi" (depo'nun son
  // eylemi, ama zincirin henüz son halkası değil) subtle/dolgusuz kalır; "Teslim edildi" (gerçek son
  // halka, müşteri onayı) tam dolgulu vurguyu taşır.
  const SUBTLE_STATUS: Partial<Record<string, Set<string>>> = { work_order: new Set(['finished']), delivery: new Set(['shipped']) };
  const subtle = Boolean(kind && SUBTLE_STATUS[kind]?.has(status ?? ''));
  const pulseDot = kind === 'work_order' && status === 'in_progress';
  return (
    <span
      data-status={status ?? ''}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        subtle ? cn('border-transparent bg-transparent', TONE_TEXT[resolvedTone]) : t.badge,
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', t.dot, pulseDot && 'motion-safe:animate-pulse')} /> : null}
      {label ?? info.label}
    </span>
  );
}

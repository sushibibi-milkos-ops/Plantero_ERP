import { cn } from '@/lib/utils';
import { daysUntil, formatDate } from '@/lib/format';

export type ExpiryLevel = 'ok' | 'notice' | 'warning' | 'critical' | 'urgent' | 'expired' | 'none';

/** 7/30/90 kuralı: geçmiş koyu kırmızı (dolu, `bg-destructive`), 0–7 gün soluk amber (dolu ama
 *  soft, `bg-warning/12`), 8–30 gün amber nokta (dolgusuz), 31–90 gün düz metin (rozet yok), 90+
 *  sessiz nötr.
 *  Önceki sürümde 8–90 gün aralığının tamamı dolgulu bir pil taşıyordu — SKT'si geçmemiş 50 satırlık
 *  bir sayfanın ~45'i kırmızı/pembe oluyor, gerçekten acil olan (<7 gün) satır diğerlerinden hiç
 *  ayrışmıyordu. Sonraki sürümde ≤7 gün de tam doygun kırmızı (`bg-destructive/80`) kaldı — Kokpit'te
 *  arka arkaya 5 satır aynı doygun kırmızı rozet basınca renk artık anlam taşımıyor, alarm duvarına
 *  dönüşüyordu (Tur 2 bulgusu). Artık yalnızca gerçekten süresi geçmiş lot tam doygun kırmızı; henüz
 *  dolmamış hiçbir gün aralığı (0–7 dahil) solid destructive kullanmıyor. */
export function expiryLevel(days: number | null): ExpiryLevel {
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 7) return 'urgent';
  if (days < 30) return 'critical';
  if (days < 60) return 'warning';
  if (days < 90) return 'notice';
  return 'ok';
}

/** Görsel ağırlık kademesi: `filled` dolgulu pil (yalnızca gerçek istisna: süresi geçmiş), `soft`
 *  soluk renkli dolgu (yaklaşan acil: 0–7 gün), `dot` dolgusuz + renkli nokta, `plain` düz metin
 *  (rozet yok), `quiet` sessiz nötr pil. `warning`/`notice` (31–90 gün) kasıtlı olarak aynı `plain`
 *  kademeyi paylaşır — ikisi de "henüz aksiyon gerektirmiyor" anlamında, ayrı renklere gerek yok. */
function levelWeight(level: ExpiryLevel): 'filled' | 'soft' | 'dot' | 'plain' | 'quiet' {
  if (level === 'expired') return 'filled';
  if (level === 'urgent') return 'soft';
  if (level === 'critical') return 'dot';
  if (level === 'warning' || level === 'notice') return 'plain';
  return 'quiet'; // ok / none
}

const LEVEL_CLASS: Record<ExpiryLevel, string> = {
  none: 'bg-muted/60 text-muted-foreground',
  ok: 'bg-muted text-foreground/75',
  notice: 'text-muted-foreground',
  warning: 'text-muted-foreground',
  critical: 'text-amber-700 dark:text-amber-400',
  urgent: 'bg-warning/12 text-warning',
  // Önceden tam doygun `bg-destructive` (beyaz metin) — sayfadaki ~20 diğer rozetin tamamı yumuşak
  // tint kullanırken tek başına en yüksek kontrastlı öğe oluyor, birden çok satırda görsel öncelik
  // sırasını bozuyordu (Tur 3 bulgusu, Kokpit). Yumuşak tint (Tur 5'ten itibaren TEK sinyal — bkz.
  // DOT_CLASS'taki "dolgu XOR nokta" notu) anatomi diğer rozetlerle birebir aynı kalır, yalnızca
  // rengiyle (destructive) en acil durumu (süresi geçmiş) ayırır.
  expired: 'bg-destructive/12 text-destructive',
};

// Kök neden (Tur 5 P1): "expired" hem dolgulu bir pil (LEVEL_CLASS: bg-destructive/12) HEM de ayrı
// renkli bir nokta taşıyordu — aynı olgu (süresi geçti) için iki üst üste kodlama, tek satırda hem
// "● 10 gün · 13.09.2026" hem zemin rengi. Tek kural: dolgu XOR nokta. `expired` zaten en güçlü
// tekil sinyali (dolgu) taşıyor — nokta kaldırıldı, yalnızca dolgusuz `critical` seviyesi nokta
// kullanır.
const DOT_CLASS: Partial<Record<ExpiryLevel, string>> = {
  critical: 'bg-amber-600 dark:bg-amber-400',
};

export const EXPIRY_LEVEL_LABELS: Record<ExpiryLevel, string> = {
  none: 'SKT yok',
  ok: '90+ gün',
  notice: '60–90 gün',
  warning: '30–60 gün',
  critical: '8–30 gün',
  urgent: '7 günden az',
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
  const weight = levelWeight(level);
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
        'inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap tabular-nums',
        weight === 'plain' ? 'h-5' : 'h-5 rounded-full px-2',
        weight === 'plain' && 'px-0',
        LEVEL_CLASS[level],
        className,
      )}
    >
      {DOT_CLASS[level] ? <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASS[level])} /> : null}
      {text}
      {showDate && date && level !== 'none' ? <span className="opacity-70">· {formatDate(date)}</span> : null}
    </span>
  );
}

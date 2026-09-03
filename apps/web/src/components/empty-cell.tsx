import { cn } from '@/lib/utils';

/**
 * Tablo/detay hücrelerinde boş değer yer tutucusu — tek bir görsel dil.
 * Aynı modülde bazı hücreler '–' (kısa çizgi, düz renk), bazıları '—' (em dash, soluk) kullanınca
 * kullanıcı "bu gerçekten boş mu yoksa veri mi eksik" diye tereddüt ediyordu (Tur 2 bulgusu).
 * Her zaman em dash + soluk ton: veri yok anlamı hatadan ayrışır.
 */
export function EmptyCell({ className }: { className?: string }) {
  return <span className={cn('text-muted-foreground/40', className)}>—</span>;
}

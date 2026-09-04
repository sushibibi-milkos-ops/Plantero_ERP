import { MoneyCell } from '@/components/money-cell';
import { D } from '@plantero/core/money';
import { cn } from '@/lib/utils';

/**
 * Banka hareketi / mutabakat tutarı: giriş/çıkış yönü NÖTR renkte `+`/`−` işaretiyle gösterilir.
 * `MoneyCell`'in `signed` modu (Tur 4 P2'de eklendi) yalnızca sayım farkı gibi İSTİSNA bir değeri
 * (amber=fazla, kırmızı=eksik) işaretlemek içindir; `MoneyCell`'in taban davranışı da negatif her
 * değeri (istisna olsun olmasın) kırmızı basar — bu yüzden `signed`'ı kaldırmak tek başına yetmez.
 *
 * Kök neden (tur 2 P0 muhasebe-banka-01 / P2 muhasebe-mutabakat-03): bir banka ekstresinde her satır
 * ya giriş ya çıkıştır — bu NORMAL bir yön bilgisidir, uyarı ya da hata değil. Önceki kullanım
 * (`signed`) her girişi amber, her çıkışı kırmızı basıyordu (11/11 satır renkli). Bu bileşen negatif
 * değeri hiçbir zaman `MoneyCell`'e ham geçirmez — mutlak değer + ayrı, nötr renkli bir işaret
 * kullanır, böylece `MoneyCell`'in kendi negatif-kırmızı kuralı da devreye girmez.
 */
export function SignedAmount({ value, currency, className }: { value: string | number | null | undefined; currency?: string; className?: string }) {
  const v = D(value);
  if (v.isZero()) return <MoneyCell value="0" currency={currency} muted className={className} />;
  const isOut = v.lt(0);
  return (
    <span className={cn('inline-flex items-center justify-end gap-0.5', className)}>
      <span aria-hidden className="text-muted-foreground/70">{isOut ? '−' : '+'}</span>
      <MoneyCell value={v.abs().toFixed(4)} currency={currency} />
    </span>
  );
}

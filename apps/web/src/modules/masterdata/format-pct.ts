/**
 * `lib/format.ts`'teki `formatPct` sabit `minimumFractionDigits: 0` kullanır — bir sütunda satır satır
 * değişken ondalık hane sayısı (%52,1 / %4 / %0,0) virgülün hizasını bozar (Tur 3 P1 bulgusu). `lib/format.ts`
 * paylaşılan bir dosya olduğu için burada değiştirilmedi (bkz. rapor "sharedComponentRequests") — bu modülün
 * kendi sütunlarında (reçete % Pay/Fire/Verim) sabit ondalık hane sayısı için bu yerel yardımcı kullanılır.
 */
export function formatPctFixed(v: string | number | null | undefined, digits: number): string {
  const num = typeof v === 'number' ? v : Number(v ?? 0);
  const nf = new Intl.NumberFormat('tr-TR', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return nf.format((Number.isFinite(num) ? num : 0) / 100);
}

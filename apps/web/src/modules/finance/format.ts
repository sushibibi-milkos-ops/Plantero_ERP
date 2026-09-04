import Decimal from 'decimal.js';

/**
 * Kriter 6 kök neden düzeltmesi (Tur 2, P1 — finans-krediler-02): paylaşılan `formatPct(v, 4)`
 * "en fazla 4 basamak" anlamına geliyordu (`apps/web/src/lib/format.ts` — ORTAK dosya, bu modül
 * değiştiremez) — kart kart ondalık uzunluğu 1/2/4 arasında salınıyordu (%3,3 / %3,63 / %3,4583).
 * Sabit 2 basamak için `minimumFractionDigits = maximumFractionDigits = 2` ile yerel biçimlendirme.
 *
 * Sunucu (kredi detay sayfası) VE istemci (`loan-panel.tsx` kartları) tarafından ortak kullanılır —
 * bu yüzden `'use client'` işaretli bir dosyadan DEĞİL, düz bir modülden export edilir (bir client
 * dosyasından sunucu bileşenine düz fonksiyon import etmek Next.js RSC sınırını ihlal eder).
 */
export function formatPctFixed(v: string | number, digits = 2): string {
  const fraction = new Decimal(v || 0).div(100).toFixed(digits + 2);
  return new Intl.NumberFormat('tr-TR', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(fraction));
}

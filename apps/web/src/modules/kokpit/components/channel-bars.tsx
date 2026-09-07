import { formatMoney } from '@/lib/format';
import { RankBar, Row } from './shared';

/**
 * "Bugünkü kanal satışları" çubukları — tek ölçü (net ciro) kanal bazında sıralanmış yatay çubuklar.
 * Kanal kimliği zaten satır etiketinde taşındığı için (bkz. dataviz skill "form heuristic": tek
 * serili sıralama grafiği kimlik ayrımı için kategorik renk GEREKTİRMEZ) çubuklar TEK bir nötr vurgu
 * rengiyle çizilir; en yüksek çubuk birincil renk, diğerleri aynı ailenin soluk tonu.
 *
 * Kök neden (Tur 1 P1 kokpit-channelbar-hue-01 + kokpit-bar-anatomy-01 + kokpit-satis-green-count-01):
 * ilk çubuk `bg-primary` (yeşil, hue 152) iken diğerleri `bg-[var(--chart-2)]` (MAVİ, hue 250) idi —
 * tek serili bir sıralama grafiğinde iki ayrı renk kimliği; ayrıca 20px yükseklik tam doygun yeşille
 * ekranın en baskın yüzeyiydi. Çubuk artık `RankBar` (shared.tsx) — "Satış hunisi" ile TEK paylaşılan
 * anatomi: 8px, rounded-full, tek hue (`bg-primary` / `bg-primary/45`).
 *
 * Düz CSS/flex (recharts DEĞİL) — `ResponsiveContainer`'ın ilk ölçüm turu (ResizeObserver) dar/mobil
 * görünümde bazen 0 genişlikte boyandığı bir kare yakalanıyordu (grafik alanı boş, yalnızca eksen
 * etiketi görünüyordu); bu sayfadaki "Satış hunisi" da zaten aynı düz-çubuk deseniyle çizilir —
 * tek ölçülü sıralama çubukları için kütüphaneye hiç gerek yok, disposisyon senkron ve garantili.
 *
 * Kök neden (Tur 4 P1 kokpit-channel-decimal-mix-01): bu satırlar `formatMoney(..., { digits: 0 })`
 * ile 0 ondalık basıyordu — AYNI sağ hizalı sütunda (GM'de "Brüt (bugün)" özet satırı, `MoneyCell`
 * ile 2 ondalık) hemen üstünde/altında iki farklı ondalık dili oluşuyordu (₺2.678,40 ↔ ₺2.678).
 * Kural yalnızca AYNI sütun içindir — KPI şeridindeki (0 ondalık) büyük rakamla bu listenin (2
 * ondalık) arasındaki kademe ayrımı KORUNUR, çünkü onlar ayrı sütunlar/bileşenlerdir. Her iki dal da
 * `digits: 2` kullanır.
 *
 * Kök neden (Tur 10 P1 kokpit-channel-single-tier-10, kriter 1): tek-kanal dalı `text-[15px]
 * font-semibold` (15px/600) basıyordu — AYNI sağ hizalı para sütunundaki özet satır ("Brüt (bugün)",
 * gm-dashboard.tsx) `13px/500`. Bugünkü veri bu iki değeri BİREBİR eşit kılınca (tek kanal → brüt =
 * o kanalın net'i) kırılım özetten DAHA YÜKSEK SESLE basılmış oluyordu — hiyerarşi VERİYE göre
 * tersine dönüyordu. Tek kanal dalı artık çok-kanallı dalla AYNI kademeyi (paylaşılan `Row`, 13px,
 * font-weight 400 — normal gövde ağırlığı, `font-semibold`/`font-medium` YOK) kullanır: bölüm içi
 * para düğümleri artık {(13,500 özet), (13,400 kırılım)} kümesine sığar, kırılım hiçbir zaman
 * özetten büyük/kalın olamaz. `Row` (shared.tsx) aynı zamanda satır bandını da (masaüstü 40px,
 * mobil ≥44px `max-sm:min-h-11`) garanti eder — üst bileşendeki (`gm-dashboard.tsx`) `p-4` sarmalayıcı
 * bu bandı bozduğu için kaldırılıp bu bileşenin KENDİ dolgusuna (Row / aşağıdaki `<ul>`) bırakıldı.
 */
export function ChannelBars({ rows }: { rows: { name: string; net: number }[] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.net - a.net).slice(0, 7);
  const max = Math.max(...sorted.map((r) => r.net), 1);
  // Tek kanal varken bir sıralama çubuğu daima %100 dolu basılır — hiçbir karşılaştırma taşımaz,
  // yalnızca dekorasyon olur (Tur 1 P1 kokpit-satis-density-01). Karşılaştıracak ikinci bir kanal
  // yoksa çubuğu hiç çizme, düz bir tutar satırı yeterli ve daha dürüst.
  if (sorted.length === 1) {
    const only = sorted[0]!;
    return (
      // Kök neden (Tur 2 P2 kokpit-14px-tier-01, üstteki Tur 10 P1 notuyla güncellendi): tek-kanal
      // satırı artık çok-kanallı listeyle AYNI paylaşılan `Row` anatomisini (13px, normal ağırlık,
      // 40/44px bant) kullanır — ayrı bir `flex items-baseline` düzeni değil.
      <Row>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{only.name}</span>
        <span className="num shrink-0 tabular-nums">{formatMoney(only.net, 'TRY', { digits: 2 })}</span>
      </Row>
    );
  }

  return (
    <ul className="space-y-2.5 px-4 py-3">
      {sorted.map((r, i) => (
        <li key={r.name} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{r.name}</span>
          <RankBar pct={(r.net / max) * 100} strong={i === 0} />
          <span className="num w-24 shrink-0 text-right text-xs tabular-nums">{formatMoney(r.net, 'TRY', { digits: 2 })}</span>
        </li>
      ))}
    </ul>
  );
}

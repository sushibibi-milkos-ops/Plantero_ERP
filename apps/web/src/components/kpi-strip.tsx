import { Children, cloneElement, isValidElement, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { KpiCard } from './kpi-card';

/**
 * `KpiCard variant="strip"` için sarmalayıcı: masaüstünde tek satır + dikey hairline'lar
 * (kutulama yok — Stripe KPI blokları çerçeveli değildir), mobilde 140px'lik kartların
 * yatay kaydıran (snap) bir şeridi. Kart yüksekliği KpiCard'da sabittir (mobil 72px,
 * masaüstü 80px) — böylece 6 kartlık bir şerit 390px'te ~750px yerine tek bir ~88px'lik
 * satıra iner.
 */
export function KpiStripRow({ children, className }: { children: React.ReactNode; className?: string }) {
  // `divide-x` kaldırıldı: KpiCard'ın kendi masaüstü kenarlığı (`md:border-l` + `md:first:border-l-0`,
  // bkz. kpi-card.tsx) artık hairline'ı tek başına taşıyor. İkisi aynı anda tanımlıyken hangisinin
  // kazandığı üretilen CSS'in sınıf sırasına bağlıydı ve pratikte hiçbiri boyanmıyordu — masaüstünde
  // KPI blokları arasında hiç ayraç görünmüyordu (Tur 4 P1 bulgusu).
  //
  // Mobilde yatay kaydırma göstergesi yoktu (gizli scrollbar + kesik 3. kart "sürükle-bırak" değil
  // "burada daha var" sinyali vermiyordu, Tur 4 P1/P2 bulgusu) — projede tam bu iş için zaten var olan
  // `scroll-fade-x` utility'si (kanban-board.tsx, document-chain.tsx) kullanılıyor: kaydırma
  // pozisyonunu izleyen sol+sağ soldurma (`background-attachment:local`), sabit tek yönlü mask-image
  // yerine. Şerit doğrudan sayfa zemininde durduğundan (var(--card) DEĞİL) `--scroll-fade-bg` ile
  // var(--background)'a eşitlenir — aksi halde açık temada beyaz/#fafafa uyuşmazlığıyla soldurma
  // görünmez kalır (bkz. document-chain.tsx aynı bulgu). Masaüstünde kaydırma yok (`md:overflow-visible`)
  // — utility'nin arka plan katmanları `md:` altında sıfırlanır, aksi halde gerekmeyen bir renk
  // yıkaması şeridin kenarlarında kalıcı olarak görünürdü.
  // 3 ya da daha az kart varsa masaüstünde `flex-1` yerine sabit min genişlik verilir (bkz.
  // kpi-card.tsx `stripCompact`) — aksi halde birkaç kart 1600px'lik şeride yayılıp aralarında
  // yüzen ~500px'lik boşluklar oluşuyordu (Tur 4 P1 bulgusu).
  const count = Children.count(children);
  const compact = count > 0 && count <= 3;
  // Yalnızca gerçek `KpiCard` çocuklarına enjekte edilir — `Children.map`/`cloneElement` DOM'a
  // duyarsızdır: yükleniyor iskeletlerinde (`loading.tsx`) aynı şeride konan çıplak `Skeleton`
  // (`@/components/ui/skeleton`, `...props`'u doğrudan bir `<div>`'e yayar) `child.type` denetimi
  // olmadan da klonlanır, `stripCompact` tanınmayan bir DOM özniteliği olarak sızar — React uyarısı
  // ve geçersiz `<div stripcompact="true">` HTML çıktısı (bkz. rapor: /depo/mal-kabul, /depo/transfer,
  // /depo/sevkiyat, /depo/sayim yükleniyor durumları, 3'ten az/eşit iskelet kartı olan her rota).
  const kids = compact
    ? Children.map(children, (child) => (isValidElement<{ stripCompact?: boolean }>(child) && child.type === KpiCard ? cloneElement(child, { stripCompact: true }) : child))
    : children;

  return (
    <div
      className={cn(
        'relative mb-6',
        'scrollbar-thin scroll-fade-x flex gap-2 overflow-x-auto pb-1',
        'snap-x snap-mandatory md:snap-none',
        'md:gap-0 md:overflow-visible md:bg-transparent md:pb-0 md:[background-image:none]',
        compact && 'md:justify-start',
        className,
      )}
      style={{ '--scroll-fade-bg': 'var(--background)' } as CSSProperties}
    >
      {kids}
    </div>
  );
}

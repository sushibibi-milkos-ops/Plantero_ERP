'use client';

import { flexRender, type Row, type Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { DataTableRowActions } from './row-actions';
import type { RowAction } from './types';

function headerLabel<T>(row: Row<T>, cellColumnId: string): string {
  const col = row.getVisibleCells().find((c) => c.column.id === cellColumnId)?.column;
  if (!col) return cellColumnId;
  return col.columnDef.meta?.label ?? (typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id);
}

/**
 * Mobil kart görünümü: sütun meta'sına göre başlık/alt başlık/rozet/satır düzeni.
 * Özel `renderCard` verilirse o kullanılır.
 */
export function DataTableMobileCards<T>({
  table,
  onRowClick,
  rowActions,
  renderCard,
}: {
  table: Table<T>;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => RowAction<T>[];
  renderCard?: (row: T) => React.ReactNode;
}) {
  const rows = table.getRowModel().rows;
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        if (renderCard) {
          return (
            <li key={row.id} onClick={() => onRowClick?.(row.original)}>
              {renderCard(row.original)}
            </li>
          );
        }
        const cells = row.getVisibleCells().filter((c) => c.column.id !== '__actions');
        const title = cells.find((c) => c.column.columnDef.meta?.mobile === 'title') ?? cells[0];
        const subtitle = cells.find((c) => c.column.columnDef.meta?.mobile === 'subtitle');
        const badges = cells.filter((c) => c.column.columnDef.meta?.mobile === 'badge');
        // 'meta': masaüstünde `hidden` olan ama kartta bağlam için gerekli alanlar (hat, tarih…) —
        // etiketsiz, tek satır, soluk/mono ("HAT1 · 04.09.2026").
        const metaCells = cells.filter((c) => c.column.columnDef.meta?.mobile === 'meta');
        const rest = cells.filter((c) => c !== title && c !== subtitle && !badges.includes(c) && !metaCells.includes(c) && c.column.columnDef.meta?.mobile !== 'hidden');
        const actions = rowActions?.(row.original) ?? [];
        return (
          <li
            key={row.id}
            onClick={() => onRowClick?.(row.original)}
            className={cn(
              'rounded-lg border border-border/70 bg-card p-3',
              onRowClick && 'cursor-pointer active:bg-accent/50',
            )}
          >
            <div className="flex items-start gap-2">
              {/* min-w-0 + overflow-hidden: bu kolon rozet/aksiyon sütunlarıyla flex'te paylaşılıyor,
                  min-w-0 olmadan içerik hiç küçülmeden kart genişliğini zorluyordu. `truncate` yalnızca
                  DÜZ METİN çocuklar için çalışır (text-overflow yalnızca bloğun kendi metnini keser);
                  hücre kendi flex/inline-flex sarmalayıcısıyla geliyorsa (ör. LotBadge, "ad + rozet"
                  span'ı) tarayıcı üç nokta basamıyor, içerik sert kesiliyordu (Tur 4 P1 bulgusu — bkz.
                  stock-table.tsx Ürün sütunu, lots-table.tsx LotBadge). `[&>*]:min-w-0 [&>*]:truncate`
                  doğrudan çocuk bir ELEMENT ise (metin değil) ona da aynı kırpma kuralını zorlar. */}
              <div className="min-w-0 flex-1 overflow-hidden">
                {title ? <div className="min-w-0 truncate text-[14px] font-medium [&>*]:min-w-0 [&>*]:max-w-full [&>*]:truncate">{flexRender(title.column.columnDef.cell, title.getContext())}</div> : null}
                {subtitle ? (
                  <div className="min-w-0 truncate text-xs text-muted-foreground [&>*]:min-w-0 [&>*]:max-w-full [&>*]:truncate">{flexRender(subtitle.column.columnDef.cell, subtitle.getContext())}</div>
                ) : null}
                {metaCells.length ? (
                  // font-mono kaldırıldı: bu satır düz etiketler taşıyor (kanal adı, ürün tipi…) —
                  // gerçek kod/belge no değeri zaten kendi hücresinde mono basılıyor (ör. LotBadge).
                  // Önceden burası mono, başlık (asıl belge no) sans basıyordu — mobilde mono/sans
                  // rolleri masaüstünün tam tersiydi (Tur 3 bulgusu).
                  // Kök neden (Tur 5 P1): "·" ayraç glifi ÖĞENİN KENDİ span'ının içindeydi — flex-wrap
                  // sarmasında ayraç içerikle birlikte alt satıra düşüyordu ("Eldeki 60 ADET" / "· Rezerve
                  // 0 ADET" gibi parçalı satırlar). Ayrıca aynı kapsayıcıda `truncate` (nowrap) ile
                  // `flex-wrap` çelişiyordu — ölü kural. Glif tamamen kaldırıldı; ayrım artık yalnızca
                  // 12px'lik yatay boşlukla kuruluyor (Linear kalıbı), `truncate` da kaldırıldı.
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/70">
                    {metaCells.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1.5">
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {badges.map((b) => (
                // max-w-[45%]: uzun bir rozet metni (ör. "10 gün önce doldu · 24.08.2026") başlık
                // sütununu (lot no/ürün adı) neredeyse sıfıra indirebiliyordu (Tur 4 P0 bulgusu) —
                // rozet kartın en fazla yarısını alır, kalan başlık sütununa geçer.
                <div key={b.id} className="max-w-[45%] shrink-0 overflow-hidden">
                  {flexRender(b.column.columnDef.cell, b.getContext())}
                </div>
              ))}
              {actions.length ? <DataTableRowActions row={row.original} actions={actions} /> : null}
            </div>
            {rest.length ? (
              // Tek ayraç kartın tam genişliğinde: her öğeye ayrı border-t vermek yerine (grid-cols-2'de
              // tek elemanlı son satırda kartın yalnızca yarısını kaplayan "kırık" bir çizgiye yol açardı)
              // <dl>'nin kendisine üstten tek bir hairline veriliyor.
              // Kök neden (Tur 3 P1): önceki sürüm her alanı DİKEY kuruyordu (etiket üstte, değer
              // altta) — alan başına iki satır harcayınca /satis/teklifler kartı 390px'te ~290px'e,
              // /satis/siparisler ~185px'e çıkıyordu (referansın 2-3 katı). Artık her hücre TEK satır:
              // etiket solda, değer sağda (items-baseline justify-between) — daima 2 sütun (alan sayısı
              // ne olursa olsun), 20px'lik tek satırlık alanlar.
              // grid-cols-2 sabit yerine grid-cols-[repeat(auto-fit,minmax(150px,1fr))]: tek metrikli
              // kartta (ör. /satis/fiyat-listeleri "Satır 33") değer artık kartın ortasında asılı
              // kalmayıp sağ kenara yaslanıyor — 2 sütunda boş bir hücre bırakmak yerine tek sütun
              // tam genişlik alıyor (Tur 4 P1 bulgusu).
              // Bu genişlikte (~330-380px kart içi) minmax(150px,1fr) pratikte HER ZAMAN tam olarak
              // 2 sütun üretir (3×150=450px sığmıyor) — bu nedenle tek başına kalan TEK SAYI'ıncı son
              // öğe (3, 5. metrik…) 2 sütunlu ızgarada yalnızca sol yarıya yerleşip değeri kartın
              // ORTASINDA asılı bırakıyordu (ör. /satis/siparisler mobil "Genel toplam", "Net ciro"
              // ile farklı bir sağ hizada duruyordu — auto-fit tek başına bunu çözmüyor, boş sütun
              // basitçe collapse OLMUYOR çünkü sütun üstteki dolu satırdan dolayı hâlâ var). Son öğe
              // hem `:last-child` hem `:nth-child(odd)` ise (2 sütunlu bir satırda YALNIZ kalmış
              // demektir) `col-span-full` ile tüm satırı kaplar, değer artık diğer satırlarla AYNI sağ
              // kenara yaslanır — tek bir dikey eksen.
              <dl className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-3 gap-y-1.5 border-t border-border/40 pt-2 text-[13px] [&>*:last-child:nth-child(odd)]:col-span-full">
                {rest.map((c) => (
                  <div key={c.id} className="flex min-w-0 items-baseline justify-between gap-2">
                    {/* Kök neden (Tur 4 P0): etiket sabit kalıp (`shrink-0`) DEĞERİN kırpılmasına izin
                        veriyordu — "Beklenen tutar" ~72px'i korurken "₺120.000,00" kalan ~77px'e
                        sığmayıp son karakterden kırpılıyordu ("₺120.000,0("), kullanıcı yanlış tutar
                        okuyordu. Para/miktar hiçbir kırılımda kesilmemeli — daralması gereken taraf
                        etiket: `dt` artık `min-w-0 truncate`, `dd` artık `shrink-0 whitespace-nowrap`
                        (truncate KALDIRILDI). */}
                    <dt className="min-w-0 truncate text-[11px] text-muted-foreground">{headerLabel(row, c.column.id)}</dt>
                    <dd className="shrink-0 text-right text-[13px] whitespace-nowrap tabular-nums">{flexRender(c.column.columnDef.cell, c.getContext())}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

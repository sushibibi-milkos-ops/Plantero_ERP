'use client';

import { flexRender, type Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { DataTableRowActions } from './row-actions';
import type { RowAction } from './types';

/** Hücrenin ham (accessor) değeri gerçekten boş mu — `getValue()` render edilmiş düğümden değil
 *  KAYNAK veriden okur, bu yüzden "—" gösteren bir hücre bile (ör. sıfır bakiye) burada boş SAYILMAZ:
 *  yalnızca gerçekten null/undefined/'' olan alanlar (veri hiç yok) elenir. */
function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Mobil kart görünümü: sütun meta'sına göre başlık/alt başlık/rozet/satır düzeni.
 * Özel `renderCard` verilirse o kullanılır.
 *
 * Kök neden (Tur 10 P1 shell-mobile-card-height-01): önceki kalıp 4 dikey katman üretiyordu
 * (başlık, alt başlık, etiketsiz meta satırı, N alanlık `<dl>`) — 99-118px, puan kartı hedefinin
 * (56-72px) çok üzerinde. Kalıp artık EN FAZLA 2 katman üretir: satır 1 başlık + rozetler, satır 2
 * alt başlık + (varsa) boş olmayan meta ipuçları + TEK metrik (kalan alanların SONUNCUSU — tablo
 * tanımlarında en önemli/parasal alan sona konur, bkz. partners-table balance, boms-table unitCost,
 * products-table listPrice). Diğer "rest" alanları mobil kartta artık hiç gösterilmez — özet karttan
 * tam alan listesi değil, detay sayfasına gitmek için yeterli bağlam beklenir. Boş değerli meta
 * hücreleri (`getValue()` null/undefined/'') satıra hiç eklenmez.
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
        // boş olanlar hiç eklenmez (Tur 10 P1).
        const metaCells = cells.filter((c) => c.column.columnDef.meta?.mobile === 'meta' && !isEmptyValue(c.getValue()));
        const rest = cells.filter((c) => c !== title && c !== subtitle && !badges.includes(c) && c.column.columnDef.meta?.mobile !== 'meta' && c.column.columnDef.meta?.mobile !== 'hidden');
        // Tek metrik: kalan alanların sonuncusu (tablo tanımında en sona konan alan modül genelinde
        // tutarlı biçimde en "parasal"/önemli alandır — bkz. yukarıdaki not).
        const metric = rest.length ? rest[rest.length - 1]! : null;
        const actions = rowActions?.(row.original) ?? [];
        // Satır 2 sol taraf: alt başlık + boş olmayan meta ipuçları, tek satırda "·" ile ayrılmış.
        const leftBits = [
          ...(subtitle ? [{ key: subtitle.id, node: flexRender(subtitle.column.columnDef.cell, subtitle.getContext()) }] : []),
          ...metaCells.map((c) => ({ key: c.id, node: flexRender(c.column.columnDef.cell, c.getContext()) })),
        ];
        return (
          <li
            key={row.id}
            onClick={() => onRowClick?.(row.original)}
            className={cn(
              // p-2.5 (p-3 değil): 2 satırlık kalıpta 12px dolgu bazı rotalarda (rozet+badge satırı
              // beklenenden birkaç px taşan) kartı 72px hedefinin hemen üstüne taşıyordu — 10px hâlâ
              // rahat, referans aralığın (56-72px) içinde güvenli pay bırakır.
              'rounded-lg border border-border/70 bg-card p-2.5',
              onRowClick && 'cursor-pointer active:bg-accent/50',
            )}
          >
            {/* Satır 1: başlık solda, rozet(ler) + aksiyon menüsü sağda. */}
            <div className="flex items-center gap-2">
              {/* min-w-0 + overflow-hidden: bu kolon rozet/aksiyon sütunlarıyla flex'te paylaşılıyor,
                  min-w-0 olmadan içerik hiç küçülmeden kart genişliğini zorluyordu. `truncate` yalnızca
                  DÜZ METİN çocuklar için çalışır (text-overflow yalnızca bloğun kendi metnini keser);
                  hücre kendi flex/inline-flex sarmalayıcısıyla geliyorsa (ör. LotBadge, "ad + rozet"
                  span'ı) tarayıcı üç nokta basamıyor, içerik sert kesiliyordu (Tur 4 P1 bulgusu — bkz.
                  stock-table.tsx Ürün sütunu, lots-table.tsx LotBadge). `[&>*]:min-w-0 [&>*]:truncate`
                  doğrudan çocuk bir ELEMENT ise (metin değil) ona da aynı kırpma kuralını zorlar. */}
              {/* leading-5 (20px): text-[14px] boyut ipucu olmadan gelir, satır yüksekliği gövdenin
                  1.5 varsayılanına (21px) düşerdi — kartı 72px hedefinin (kriter 3) hemen üstüne
                  taşıyordu (72.5px ölçüldü). */}
              <div className="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium [&>*]:min-w-0 [&>*]:max-w-full [&>*]:truncate">
                {title ? flexRender(title.column.columnDef.cell, title.getContext()) : null}
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
            {/* Satır 2: alt başlık (+ meta ipuçları) solda, tek metrik sağda — kalıp burada durur. */}
            {leftBits.length || metric ? (
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground [&>*]:min-w-0 [&>*]:max-w-full [&>*]:truncate">
                  {leftBits.map((b, i) => (
                    <span key={b.key} className="inline-flex min-w-0 items-center gap-1.5 truncate">
                      {i > 0 ? <span aria-hidden className="text-muted-foreground/40">·</span> : null}
                      {b.node}
                    </span>
                  ))}
                </div>
                {metric ? (
                  <div className="shrink-0 text-[13px] tabular-nums">{flexRender(metric.column.columnDef.cell, metric.getContext())}</div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

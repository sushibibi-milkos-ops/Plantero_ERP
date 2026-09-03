'use client';

import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function DataTablePagination<TData>({ table, pageSizes = [25, 50, 100] }: { table: Table<TData>; pageSizes?: number[] }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  if (total === 0) return null;
  const from = pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const pageCount = table.getPageCount();
  const hasMultiplePages = pageCount > 1;

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Sayfa başına</span>
        <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
          {/* Kök neden (Tur 5 P1): SelectTrigger'ın kendi taban sınıfı `data-[size=sm]:h-8` bir
              ATTRIBUTE selector taşıdığı için düz `h-11`/`md:h-7` sınıflarından daha yüksek özgüllüğe
              sahip — önceki override hiçbir zaman uygulanmıyordu, seçici 390px'te gerçekte 32px
              kalıyordu (/depo/stok, /depo/skt). Override artık AYNI `data-[size=sm]:` zincirini
              hedefliyor (mobilde 44px, masaüstünde native "sm" 32px). */}
          <SelectTrigger size="sm" className="w-[76px] text-xs data-[size=sm]:h-11 md:w-[70px] md:data-[size=sm]:h-8" aria-label="Sayfa boyutu">
            {/* İlk boyanmada Radix'in kendi değer okuması birkaç saniye boş kutu bırakabiliyordu
                (ekran görüntüsü aracı bunu bazen yakaladı, Tur 4 P2 bulgusu) — değer zaten elimizde
                olduğundan doğrudan basılır, Radix'in iç render'ına bağımlı kalınmaz. */}
            <SelectValue>{pageSize}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-2 tabular-nums">
          {from.toLocaleString('tr-TR')}–{to.toLocaleString('tr-TR')} / {total.toLocaleString('tr-TR')}
        </span>
        {/* Tek sayfaya sığan sonuçlarda gezinme kontrolleri (önceki/sonraki/ilk/son) gösterilmez —
            tıklanamaz "1/1" düğme takımı gereksiz gürültü olurdu. */}
        {hasMultiplePages ? (
          <>
            <Button variant="ghost" size="icon-xs" className="hidden sm:inline-flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} aria-label="İlk sayfa">
              <ChevronsLeft />
            </Button>
            {/* Önceki/Sonraki her genişlikte görünür (İlk/Son'un aksine) — bu yüzden dokunma hedefi
                mobilde 44px'e çıkar, masaüstünde 32px yoğunlukta kalır. */}
            <Button variant="ghost" size="icon-xs" className="size-11 md:size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Önceki sayfa">
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button variant="ghost" size="icon-xs" className="size-11 md:size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Sonraki sayfa">
              <ChevronRight />
            </Button>
            <Button variant="ghost" size="icon-xs" className="hidden sm:inline-flex" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()} aria-label="Son sayfa">
              <ChevronsRight />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

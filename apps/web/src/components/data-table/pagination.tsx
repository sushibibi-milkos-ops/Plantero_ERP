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
          <SelectTrigger size="sm" className="h-11 w-[76px] text-xs md:h-7 md:w-[70px]" aria-label="Sayfa boyutu">
            <SelectValue />
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

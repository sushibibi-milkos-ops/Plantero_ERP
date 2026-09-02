'use client';

import type { Table } from '@tanstack/react-table';
import { Search, X, ListFilter, Check, Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DataTableFilter } from './types';

const TONE_DOT: Record<string, string> = {
  neutral: 'bg-foreground/50',
  muted: 'bg-muted-foreground/60',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  primary: 'bg-primary',
};

export function DataTableToolbar<TData>({
  table,
  searchable = true,
  searchPlaceholder = 'Ara…',
  filters = [],
  columnToggle = true,
  extra,
  total,
}: {
  table: Table<TData>;
  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: DataTableFilter[];
  columnToggle?: boolean;
  extra?: React.ReactNode;
  total?: number;
}) {
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? '';
  const hasColumnFilters = table.getState().columnFilters.length > 0;
  const showToolbar = searchable || filters.length > 0 || columnToggle || extra;
  if (!showToolbar) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {searchable ? (
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-[13px] md:text-[13px]"
            aria-label="Tabloda ara"
          />
          {globalFilter ? (
            <button
              type="button"
              onClick={() => table.setGlobalFilter('')}
              className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Aramayı temizle"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      {filters.map((f) => {
        const column = table.getColumn(f.columnId);
        if (!column) return null;
        const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
        const facets = column.getFacetedUniqueValues();
        return (
          <DropdownMenu key={f.columnId}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-8 border-dashed text-[13px]', selected.size && 'border-solid')}>
                <ListFilter className="size-3.5" />
                {f.title}
                {selected.size ? (
                  <span className="ml-0.5 rounded bg-primary/10 px-1.5 py-px font-mono text-[10px] text-primary">{selected.size}</span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground uppercase">{f.title}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {f.options.map((o) => {
                const count = facets.get(o.value) ?? 0;
                return (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={selected.has(o.value)}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v) next.add(o.value);
                      else next.delete(o.value);
                      column.setFilterValue(next.size ? Array.from(next) : undefined);
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {o.tone ? <span className={cn('size-1.5 rounded-full', TONE_DOT[o.tone])} /> : o.icon ? <o.icon className="size-3.5" /> : null}
                    <span className="flex-1">{o.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
                  </DropdownMenuCheckboxItem>
                );
              })}
              {selected.size ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => column.setFilterValue(undefined)} className="justify-center text-xs">
                    Temizle
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      {hasColumnFilters ? (
        <Button variant="ghost" size="sm" className="h-8 text-[13px]" onClick={() => table.resetColumnFilters()}>
          Sıfırla <X className="size-3.5" />
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {total !== undefined ? <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{total.toLocaleString('tr-TR')} kayıt</span> : null}
        {extra}
        {columnToggle ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" className="hidden md:inline-flex" aria-label="Sütunlar">
                <Columns3 className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground uppercase">Sütunlar</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={c.getIsVisible()}
                    onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.columnDef.meta?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}
                    {c.getIsVisible() ? <Check className="ml-auto size-3 text-primary" /> : null}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

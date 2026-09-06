'use client';

import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Search, X, ListFilter } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { statusOptions, type StatusTone } from '@/lib/status';
import { OrdersTable } from './orders-table';
import { OrdersBoard } from './orders-board';
import type { MaintenanceOrderRow } from '../queries';

const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-foreground/50', muted: 'bg-muted-foreground/60', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', primary: 'bg-primary',
};

const VIEW_STORAGE_KEY = 'plantero.bakim.is-emirleri.view';

type FilterKey = 'status' | 'kind' | 'priority';

const FILTER_DEFS: Array<{ key: FilterKey; title: string; options: ReturnType<typeof statusOptions> }> = [
  { key: 'status', title: 'Durum', options: statusOptions('maintenance') },
  { key: 'kind', title: 'Tür', options: statusOptions('maintenance_kind') },
  { key: 'priority', title: 'Öncelik', options: statusOptions('maintenance_priority') },
];

function trIncludes(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('tr-TR').includes(needle.toLocaleLowerCase('tr-TR'));
}

/**
 * Kriter 11 (Tur 1 P1 bakim-isemirleri-01) kök neden düzeltmesi: arama + 3 filtre eskiden yalnızca
 * `OrdersTable`'ın (liste/mobil) İÇİNDE, `DataTable`'ın kendi tanstack state'ine bağlıydı — kanban
 * görünümüne hiç geçmiyordu, aynı route viewport'a göre farklı yetenek sunuyordu. Arama/filtre
 * durumu buraya (görünümden bağımsız üst bileşene) taşındı; her iki alt bileşen de ARTIK aynı
 * önceden-filtrelenmiş diziyi alır ve kendi iç arama/filtresini kapatır (`OrdersTable` `searchable=
 * false filters=[]`) — tek gerçek kaynak, iki kez filtreleme/iki toolbar yok.
 *
 * Kriter 3 (Tur 1 P1 bakim-isemirleri-02) kök neden düzeltmesi: varsayılan görünüm 'kanban' iken
 * 1440×900'de 6 kayıttan yalnızca 1'i görünüyordu (4 boş sütun + ~600px ölü alan) ve tercih
 * `useState`'te tutulduğundan her sayfa geçişinde sıfırlanıyordu. Varsayılan artık 'list' (ilk
 * ekranda tüm kayıtlar görünür); kullanıcı kanbanı seçerse tercih `localStorage`'da kalıcı olur.
 */
export function OrdersView({ orders }: { orders: MaintenanceOrderRow[] }) {
  const [view, setView] = useState<'kanban' | 'list'>('list');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<FilterKey, Set<string>>>({ status: new Set(), kind: new Set(), priority: new Set() });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'kanban' || stored === 'list') setView(stored);
    } catch {
      // localStorage kapalı/erişilemez olabilir (gizli sekme) — varsayılan 'list' ile devam.
    }
  }, []);

  function changeView(next: 'kanban' | 'list') {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // sessizce yok say — görünüm tercihi bu sekmede kalıcı olmaz ama uygulama çalışmaya devam eder.
    }
  }

  function toggleFilter(key: FilterKey, value: string) {
    setFilters((cur) => {
      const next = new Set(cur[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...cur, [key]: next };
    });
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (search && !trIncludes(`${o.docNo} ${o.title} ${o.machineCode} ${o.machineName}`, search)) return false;
      if (filters.status.size && !filters.status.has(o.status)) return false;
      if (filters.kind.size && !filters.kind.has(o.kind)) return false;
      if (filters.priority.size && !filters.priority.has(o.priority)) return false;
      return true;
    });
  }, [orders, search, filters]);

  const activeFilterCount = filters.status.size + filters.kind.size + filters.priority.size;
  const isFiltering = Boolean(search) || activeFilterCount > 0;
  const valueOf: Record<FilterKey, (o: MaintenanceOrderRow) => string> = {
    status: (o) => o.status, kind: (o) => o.kind, priority: (o) => o.priority,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="İş emri no, başlık, makine ara…"
            className="h-11 pl-8 text-[13px] md:h-8"
            aria-label="İş emirlerinde ara"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Aramayı temizle"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        {FILTER_DEFS.map((f) => {
          const selected = filters[f.key];
          const counts = new Map<string, number>();
          for (const o of orders) counts.set(valueOf[f.key](o), (counts.get(valueOf[f.key](o)) ?? 0) + 1);
          return (
            <DropdownMenu key={f.key}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={cn('h-11 border border-border/70 bg-card text-[13px] md:h-8', selected.size && 'border-primary/40 bg-primary/5')}>
                  <ListFilter className="size-3.5" />
                  {f.title}
                  {selected.size ? <span className="ml-0.5 rounded bg-primary/10 px-1.5 py-px font-mono text-[10px] text-primary">{selected.size}</span> : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground uppercase">{f.title}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {f.options.map((o) => (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={selected.has(o.value)}
                    onCheckedChange={() => toggleFilter(f.key, o.value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className={cn('size-1.5 rounded-full', TONE_DOT[o.tone])} />
                    <span className="flex-1">{o.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{counts.get(o.value) ?? 0}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                {selected.size ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setFilters((cur) => ({ ...cur, [f.key]: new Set() }))} className="justify-center text-xs">
                      Temizle
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        {activeFilterCount ? (
          <Button variant="ghost" size="sm" className="h-11 text-[13px] md:h-8" onClick={() => setFilters({ status: new Set(), kind: new Set(), priority: new Set() })}>
            Sıfırla <X className="size-3.5" />
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{filtered.length.toLocaleString('tr-TR')} kayıt</span>
          {/* Görünüm seçici yalnızca md+'ta anlamlı — 390px'te kanban zaten kullanılamaz olduğundan
              (aşağıda her koşulda liste zorlanır) burada gösterilmesi kafa karıştırırdı. */}
          <div className="hidden shrink-0 items-center gap-1 rounded-md border border-border/70 p-0.5 md:flex">
            <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => changeView('kanban')} aria-label="Kanban görünümü"><LayoutGrid className="size-3.5" /></Button>
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => changeView('list')} aria-label="Liste görünümü"><List className="size-3.5" /></Button>
          </div>
        </div>
      </div>

      {/* 390px'te kanban sütunları kullanılamaz — mobilde her zaman liste zorlanır (sales kanban-board.tsx ile aynı desen). */}
      <div className="md:hidden">
        <OrdersTable orders={filtered} searchable={false} filters={[]} externallyFiltered={isFiltering} />
      </div>
      <div className="hidden md:block">{view === 'kanban' ? <OrdersBoard orders={filtered} /> : <OrdersTable orders={filtered} searchable={false} filters={[]} />}</div>
    </div>
  );
}

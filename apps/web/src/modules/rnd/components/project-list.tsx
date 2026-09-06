'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { List, LayoutGrid, Kanban, FlaskConical, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NewProjectDialog } from './new-project-dialog';
import { PROJECT_STATUS_LABELS } from '../labels';
import type { ProjectRow, ProductOption } from '../queries';

const VIEW_STORAGE_KEY = 'plantero.arge.projeler.view';

/**
 * Yoğunluk + tutarlılık kök neden düzeltmesi (Tur 1 P1 arge-projeler-01/02): eskiden yalnızca
 * kart grid'i vardı (900px viewport'ta 3 kart ~215px kaplıyor, altında ~470px ölü alan) ve
 * kardeş rota `/arge/receteler`teki arama+filtre+sayaç şeridi hiç yoktu. Liste görünümü artık
 * AYNI `DataTable` bileşenini kullanır (arama/filtre/sayaç/sütun seçici bedava gelir, `/arge/
 * receteler` ile birebir aynı) ve varsayılan — ilk ekranda tüm kayıtlar 36px satırlarda görünür.
 * Kart görünümü (daha zengin özet) tercih edilirse kalır; seçim `localStorage`da kalıcıdır
 * (maintenance/orders-view.tsx ile aynı desen).
 */
export function ProjectList({
  projects,
  canManage,
  productOptions,
}: {
  projects: ProjectRow[];
  canManage: boolean;
  productOptions: ProductOption[];
}) {
  const [view, setView] = useState<'list' | 'card'>('list');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'list' || stored === 'card') setView(stored);
    } catch {
      // localStorage kapalı/erişilemez olabilir — varsayılan 'list' ile devam.
    }
  }, []);

  function changeView(next: 'list' | 'card') {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // sessizce yok say
    }
  }

  const newProjectAction = canManage ? <NewProjectDialog productOptions={productOptions} /> : undefined;

  // NOT: `columns`/`filters` hesaplaması Hooks kurallarına uymak için erken dönüşten (boş liste)
  // ÖNCE tanımlanır — koşullu `return` sonrası hook çağrısı yasaktır.
  const columns = useMemo<ColumnDef<ProjectRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Kod', meta: { width: 96 }, cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.code}</span> },
      { accessorKey: 'name', header: 'Proje', meta: { mobile: 'title', flex: true }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 120, mobile: 'badge' },
        cell: ({ row }) => {
          const info = PROJECT_STATUS_LABELS[row.original.status] ?? { label: row.original.status, tone: 'muted' as const };
          return <StatusBadge status={row.original.status} label={info.label} tone={info.tone} />;
        },
      },
      {
        id: 'product', accessorFn: (r) => r.productSku ?? r.targetSku ?? '', header: 'Ürün / SKU', meta: { width: 150, mobile: 'subtitle' },
        cell: ({ row }) => {
          const p = row.original;
          if (p.productSku) return <span className="font-mono text-xs">{p.productSku}</span>;
          if (p.targetSku) return <span className="font-mono text-xs text-muted-foreground">{p.targetSku} (aday)</span>;
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'unitCost', accessorFn: (r) => Number(r.currentUnitCost ?? 0), header: 'Birim maliyet', meta: { width: 130, align: 'right' },
        cell: ({ row }) => {
          const p = row.original;
          const overTarget = p.targetUnitCost && p.currentUnitCost && Number(p.currentUnitCost) > Number(p.targetUnitCost);
          if (!p.currentUnitCost) return <span className="text-muted-foreground">—</span>;
          return <MoneyCell value={p.currentUnitCost} digits={2} className={cn(overTarget && 'text-warning')} />;
        },
      },
      { id: 'ownerName', accessorFn: (r) => r.ownerName ?? '', header: 'Sahibi', meta: { width: 130, mobile: 'hidden' }, cell: ({ row }) => row.original.ownerName ?? <span className="text-muted-foreground">Sahipsiz</span> },
      {
        id: 'targetLaunchDate', accessorFn: (r) => r.targetLaunchDate ?? '', header: 'Lansman', meta: { width: 110, align: 'right', mobile: 'hidden' },
        cell: ({ row }) => (row.original.targetLaunchDate ? formatDate(row.original.targetLaunchDate) : <span className="text-muted-foreground">—</span>),
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: Object.entries(PROJECT_STATUS_LABELS).map(([value, v]) => ({ value, label: v.label, tone: v.tone })) },
  ];

  if (projects.length === 0) {
    return (
      <EmptyState
        title="Henüz Ar-Ge projesi yok"
        description="Yeni bir proje oluşturup Trello mantığı board'u kullanmaya başlayın."
        action={newProjectAction}
      />
    );
  }

  const viewToggle = (
    <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/70 p-0.5">
      <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => changeView('list')} aria-label="Liste görünümü"><List className="size-3.5" /></Button>
      <Button variant={view === 'card' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => changeView('card')} aria-label="Kart görünümü"><LayoutGrid className="size-3.5" /></Button>
    </div>
  );

  if (view === 'list') {
    return (
      <DataTable
        columns={columns}
        data={projects}
        getRowId={(r) => r.id}
        searchPlaceholder="Proje veya kod ara…"
        filters={filters}
        toolbarExtra={viewToggle}
        initialSorting={[{ id: 'code', desc: false }]}
        emptyTitle="Sonuç yok"
        emptyDescription="Arama ya da filtreyle eşleşen proje bulunamadı."
        rowHref={(row) => `/arge/projeler/${row.id}/board`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{viewToggle}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const status = PROJECT_STATUS_LABELS[p.status] ?? { label: p.status, tone: 'muted' as const };
          const overTarget = p.targetUnitCost && p.currentUnitCost && Number(p.currentUnitCost) > Number(p.targetUnitCost);
          return (
            <Link
              key={p.id}
              href={`/arge/projeler/${p.id}/board`}
              className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 transition-[transform,box-shadow] duration-150 ease-out hover:border-border hover:shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-muted-foreground">{p.code}</div>
                  <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
                </div>
                <StatusBadge status={p.status} label={status.label} tone={status.tone} />
              </div>

              {p.goal ? <p className="line-clamp-2 text-[13px] text-muted-foreground">{p.goal}</p> : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Kanban className="size-4" /> {p.cardCount} kart / {p.columnCount} kolon</span>
                {p.productSku ? <span className="inline-flex items-center gap-1"><FlaskConical className="size-4" /> {p.productSku}</span> : p.targetSku ? <span className="inline-flex items-center gap-1"><Target className="size-4" /> {p.targetSku} (aday)</span> : null}
              </div>

              {(p.targetUnitCost || p.currentUnitCost) ? (
                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-[11px]">
                  <span className="text-muted-foreground">Birim maliyet</span>
                  <div className="flex items-center gap-1.5">
                    {p.currentUnitCost ? <MoneyCell value={p.currentUnitCost} digits={2} className={cn('text-[13px] font-medium', overTarget && 'text-warning')} /> : <span className="text-muted-foreground">—</span>}
                    {p.targetUnitCost ? <span className="text-muted-foreground">/ hedef <MoneyCell value={p.targetUnitCost} digits={2} className="text-muted-foreground" /></span> : null}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{p.ownerName ?? 'Sahipsiz'}</span>
                {p.targetLaunchDate ? <span>Lansman {formatDate(p.targetLaunchDate)}</span> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

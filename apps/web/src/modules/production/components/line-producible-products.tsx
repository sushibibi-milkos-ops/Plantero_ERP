'use client';

import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import type { LineProducibleRow } from '../queries';

export type ProducibleLine = { id: string; code: string; name: string };

const KIND_LABEL: Record<LineProducibleRow['kind'], { label: string; tone: 'primary' | 'info' }> = {
  finished: { label: 'Mamul', tone: 'primary' },
  semi_finished: { label: 'Yarı mamul', tone: 'info' },
};

/** "2 seviye" — 1 seviye: yalnızca hammadde/ambalaj; 2+: alt reçeteli (yarı mamullü) ağaç */
function depthLabel(r: LineProducibleRow): string {
  return `${r.depth} seviye`;
}

const columns: ColumnDef<LineProducibleRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Ürün',
    meta: { mobile: 'title' },
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.name}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{row.original.sku}</div>
      </div>
    ),
  },
  {
    id: 'kind',
    accessorFn: (r) => r.kind,
    header: 'Tip',
    meta: { width: 120, mobile: 'badge' },
    cell: ({ row }) => <StatusBadge status={row.original.kind} label={KIND_LABEL[row.original.kind].label} tone={KIND_LABEL[row.original.kind].tone} />,
  },
  {
    id: 'bom',
    accessorFn: (r) => r.bomCode,
    header: 'Aktif reçete',
    meta: { width: 190, mobile: 'meta' },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 items-center rounded-md bg-success/12 px-1.5 text-[11px] font-medium tabular-nums text-success">v{row.original.bomVersion}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{row.original.bomCode}</span>
      </div>
    ),
  },
  {
    id: 'depth',
    accessorFn: (r) => r.depth,
    header: 'Ürün ağacı',
    meta: { width: 160, mobile: 'meta' },
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5 text-[13px]">
        <Layers aria-hidden className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="tabular-nums">{depthLabel(row.original)}</span>
        {row.original.subAssemblyCount > 0 ? <span className="text-[11px] text-muted-foreground">· {row.original.subAssemblyCount} alt reçete</span> : null}
      </div>
    ),
  },
  {
    accessorKey: 'componentCount',
    header: 'Bileşen',
    meta: { align: 'right', width: 88, mobile: 'hidden' },
    cell: ({ row }) => <span className="num text-[13px]">{row.original.componentCount}</span>,
  },
];

const filters: DataTableFilter[] = [
  {
    columnId: 'kind',
    title: 'Tip',
    options: [
      { value: 'finished', label: 'Mamul' },
      { value: 'semi_finished', label: 'Yarı mamul' },
    ],
  },
];

/**
 * "Üretilebilir ürünler" — hat başına: aktif reçetesinin varsayılan hattı o hat olan mamuller ve yarı
 * mamuller (docs/PRODUCTION-LINES.md hat ataması). Satır → ürün kartının reçete sekmesi.
 */
export function LineProducibleProducts({ lines, rowsByLine }: { lines: ProducibleLine[]; rowsByLine: Record<string, LineProducibleRow[]> }) {
  const firstWithRows = lines.find((l) => (rowsByLine[l.id]?.length ?? 0) > 0) ?? lines[0];
  const [active, setActive] = useState<string>(firstWithRows?.id ?? '');
  const total = useMemo(() => lines.reduce((a, l) => a + (rowsByLine[l.id]?.length ?? 0), 0), [lines, rowsByLine]);

  if (lines.length === 0) return null;

  return (
    <section aria-labelledby="producible-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="producible-title" className="text-[17px] font-semibold tracking-tight">
          Üretilebilir ürünler
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Aktif reçetesinin varsayılan hattı o hat olan mamuller ve yarı mamuller · toplam {total} ürün
        </p>
      </div>

      <Tabs value={active} onValueChange={setActive}>
        <TabsList aria-label="Hat">
          {lines.map((l) => {
            const rows = rowsByLine[l.id] ?? [];
            return (
              <TabsTrigger key={l.id} value={l.id} className="gap-2 md:min-w-24">
                <span className="font-mono text-xs">{l.code}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{rows.length}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {lines.map((l) => {
          const rows = rowsByLine[l.id] ?? [];
          const finished = rows.filter((r) => r.kind === 'finished').length;
          const semi = rows.length - finished;
          return (
            <TabsContent key={l.id} value={l.id} className="space-y-3 pt-1">
              <p className="text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">{l.name}</span> · {finished} mamul · {semi} yarı mamul
              </p>
              {rows.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="Bu hatta tanımlı ürün yok"
                  description="Bir ürünün aktif reçetesinde varsayılan hat olarak bu hat seçildiğinde burada listelenir."
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(r) => r.productId}
                  rowHref={(r) => `/ana-veri/urunler/${r.productId}?tab=recete`}
                  searchPlaceholder="Ürün adı, SKU ara…"
                  filters={filters}
                  columnToggle={false}
                  emptyTitle="Eşleşen ürün yok"
                />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}

'use client';

import { useMemo, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assignHsCodeAction } from '../actions';
import type { GtipProductRow } from '../queries';
import type { hsCodes } from '@plantero/db';

type HsCode = typeof hsCodes.$inferSelect;

const TYPE_LABEL: Record<string, string> = {
  raw_material: 'Hammadde', packaging: 'Ambalaj', semi_finished: 'Yarı mamul', finished: 'Mamul', merchandise: 'Ticari mal',
};

function HsCodeCell({ row, hsCodeOptions, editable }: { row: GtipProductRow; hsCodeOptions: HsCode[]; editable: boolean }) {
  const [pending, startTransition] = useTransition();

  if (!editable) {
    return row.hsCode ? <span className="font-mono">{row.hsCode}</span> : <span className="text-muted-foreground">Eşlenmedi</span>;
  }

  return (
    <Select
      value={row.hsCode ?? '__none'}
      disabled={pending}
      onValueChange={(value) => {
        const hsCode = value === '__none' ? null : value;
        startTransition(async () => {
          const res = await assignHsCodeAction({ productId: row.id, hsCode });
          if (res.ok) toast.success(`${row.sku} → ${hsCode ?? 'GTİP kaldırıldı'}`);
          else toast.error(res.error);
        });
      }}
    >
      <SelectTrigger className="h-9 w-full min-w-[9rem] font-mono text-[13px]">
        <SelectValue placeholder="GTİP seçin" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">
          <span className="text-muted-foreground">Eşlenmedi</span>
        </SelectItem>
        {hsCodeOptions.map((h) => (
          <SelectItem key={h.code} value={h.code}>
            <span className="font-mono">{h.code}</span>
            <span className="ml-1.5 text-muted-foreground">{h.description}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GtipMappingTable({ products, hsCodeOptions, editable }: { products: GtipProductRow[]; hsCodeOptions: HsCode[]; editable: boolean }) {
  const columns = useMemo<ColumnDef<GtipProductRow, unknown>[]>(
    () => [
      { accessorKey: 'sku', header: 'SKU', meta: { width: 130, className: 'font-mono', mobile: 'subtitle' } },
      { accessorKey: 'name', header: 'Ürün', meta: { mobile: 'title' } },
      { id: 'category1', accessorFn: (r) => r.category1 ?? '', header: 'Kategori', meta: { width: 160, mobile: 'hidden' }, cell: ({ getValue }) => getValue<string>() || <span className="text-muted-foreground">—</span> },
      { id: 'type', accessorFn: (r) => r.type, header: 'Tip', meta: { width: 110, mobile: 'hidden' }, cell: ({ getValue }) => TYPE_LABEL[getValue<string>()] ?? getValue<string>() },
      {
        id: 'hsCode', accessorFn: (r) => r.hsCode ?? '', header: 'GTİP', meta: { width: 260, mobile: 'badge' },
        cell: ({ row }) => <HsCodeCell row={row.original} hsCodeOptions={hsCodeOptions} editable={editable} />,
      },
    ],
    [hsCodeOptions, editable],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'hsCode', title: 'Eşleme', options: [{ value: '', label: 'Eşlenmemiş' }] },
    { columnId: 'type', title: 'Tip', options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={products}
      getRowId={(r) => r.id}
      searchPlaceholder="SKU veya ürün adı ara…"
      filters={filters}
      emptyTitle="Satılabilir ürün yok"
      emptyDescription="GTİP eşlemesi yalnızca satılabilir (isSellable) ürünler için yapılır."
    />
  );
}

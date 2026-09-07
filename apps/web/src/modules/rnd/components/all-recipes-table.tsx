'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { cn } from '@/lib/utils';
import { TRIAL_STATUS_LABELS } from '../labels';
import type { RecipeSummaryRow } from '../queries';

export function AllRecipesTable({ recipes }: { recipes: RecipeSummaryRow[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<RecipeSummaryRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: 'Reçete', meta: { mobile: 'title', flex: true } },
      { accessorKey: 'projectName', header: 'Proje', meta: { mobile: 'subtitle' } },
      // meta.mobile:'meta' — eskiden mobil kartta hiç görünmüyordu (Tur 1 P2 arge-receteler-01):
      // hangi versiyonun maliyeti gösterildiği mobilde okunamıyordu.
      { id: 'version', accessorFn: (r) => r.latestVersion ?? 0, header: 'Versiyon', meta: { width: 90, mobile: 'meta', label: 'Versiyon' }, cell: ({ row }) => (row.original.latestVersion != null ? `v${row.original.latestVersion}` : '—') },
      {
        id: 'status', accessorFn: (r) => r.latestStatus ?? '', header: 'Durum', meta: { width: 130, mobile: 'badge' },
        cell: ({ row }) => {
          const s = row.original.latestStatus;
          if (!s) return <span className="text-muted-foreground">—</span>;
          const info = TRIAL_STATUS_LABELS[s] ?? { label: s, tone: 'muted' as const };
          return <StatusBadge status={s} label={info.label} tone={info.tone} />;
        },
      },
      {
        id: 'unitCost', accessorFn: (r) => Number(r.latestUnitCost ?? 0), header: 'Birim maliyet', meta: { width: 120, align: 'right' },
        cell: ({ row }) => {
          const p = row.original;
          if (!p.latestUnitCost) return <span className="text-muted-foreground">—</span>;
          // Kök neden düzeltmesi (Tur 9 P2 arge-receteler-03): kardeş ekran /arge/projeler'de
          // AYNI olgu (birim maliyet proje hedefinin üstünde) `text-warning` ile basılıyordu, burada
          // nötr foreground kalıyordu — proje-list.tsx (project-list.tsx:85-87) ile BİREBİR aynı kural.
          const overTarget = p.targetUnitCost && Number(p.latestUnitCost) > Number(p.targetUnitCost);
          return <MoneyCell value={p.latestUnitCost} digits={2} className={cn(overTarget && 'text-warning')} />;
        },
      },
      { id: 'versionCount', accessorFn: (r) => r.versionCount, header: 'Versiyonlar', meta: { width: 100, align: 'right', mobile: 'hidden' } },
      {
        id: 'bom', accessorFn: (r) => r.releasedBomCode ?? '', header: 'Devrolmuş BOM', meta: { width: 140, mobile: 'hidden' },
        cell: ({ row }) => (row.original.releasedBomCode ? <span className="font-mono text-xs">{row.original.releasedBomCode}</span> : <span className="text-muted-foreground">—</span>),
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    {
      columnId: 'status', title: 'Durum',
      options: Object.entries(TRIAL_STATUS_LABELS).map(([value, v]) => ({ value, label: v.label, tone: v.tone })),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={recipes}
      getRowId={(r) => r.id}
      searchPlaceholder="Reçete veya proje ara…"
      filters={filters}
      initialSorting={[{ id: 'unitCost', desc: true }]}
      emptyTitle="Henüz deneme reçetesi yok"
      emptyDescription="Bir Ar-Ge projesinde deneme reçetesi oluşturduğunuzda burada listelenir."
      // Reçete bir projeye bağlı olduğundan (belge zinciri: proje → reçete → versiyon) burada
      // doğrudan oluşturma yok — proje listesine yönlendirir (Tur 2 P2 arge-receteler-03: eylemsiz
      // boş durum, /arge/projeler'deki EmptyState eylemiyle tutarsızdı).
      emptyAction={<Button asChild size="sm"><Link href="/arge/projeler"><FolderKanban className="size-4" /> Ar-Ge projelerine git</Link></Button>}
      onRowClick={(row) => router.push(`/arge/projeler/${row.projectId}/receteler`)}
    />
  );
}

'use client';

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { statusOptions } from '@/lib/status';
import { formatDate, daysUntil } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MachineListRow } from '../queries';
import { MACHINE_CATEGORY_LABELS } from '../labels';

export function MachinesTable({ machines }: { machines: MachineListRow[] }) {
  const columns = useMemo<ColumnDef<MachineListRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Kod', meta: { mobile: 'title', className: 'font-mono', width: 90 } },
      {
        id: 'name', accessorFn: (r) => r.name, header: 'Makine', meta: { mobile: 'subtitle', flex: true },
        // Kök neden (Tur 4 P2 bakim-makineler-02): bu hücre masaüstünde iki satır (ad + kategori)
        // basıyor; mobil kartta "subtitle" olarak tek satırlık ikinci satıra taşındığında kategori
        // satırı İÇİNDE ikinci bir blok satır daha üretip kartı 3 satıra (76.7px, hedef ≤72px)
        // şişiriyordu. Kategori masaüstü-yalnızca bilgidir (mobil kartta zaten Kod+Durum rozeti
        // yeterli bağlamı veriyor) — `hidden md:block` ile yalnızca masaüstü tablo hücresinde basılır.
        cell: ({ row }) => (
          <div>
            <div>{row.original.name}</div>
            <div className="hidden text-[11px] text-muted-foreground md:block">{MACHINE_CATEGORY_LABELS[row.original.category] ?? row.original.category}</div>
          </div>
        ),
      },
      { id: 'lineCode', accessorFn: (r) => r.lineCode ?? '—', header: 'Hat', meta: { width: 90, mobile: 'hidden' } },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 120, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="machine" /> },
      {
        id: 'nextDueAt', accessorFn: (r) => r.nextDueAt ?? '', header: 'Sonraki bakım', meta: { width: 140 },
        cell: ({ row }) => {
          const v = row.original.nextDueAt;
          if (!v) return <span className="text-muted-foreground">—</span>;
          const d = daysUntil(v) ?? 0;
          return (
            <span className={cn('inline-flex items-center gap-1', d < 0 && 'font-medium text-destructive')}>
              {d < 0 ? <AlertTriangle className="size-3.5" /> : null}
              {formatDate(v)}
            </span>
          );
        },
      },
      {
        id: 'runtimeHours', accessorFn: (r) => Number(r.runtimeHours), header: 'Çalışma saati', meta: { align: 'right', width: 110, mobile: 'hidden', className: 'num tabular-nums' },
        cell: ({ row }) => <QtyCell value={row.original.runtimeHours} uom="sa" />,
      },
      {
        // Kök neden (Tur 10 P1 bakim-makineler-07): bu sütun `rest` listesinin (meta.mobile
        // ayarsız kalan sütunlar) sonuncusuydu, DataTableMobileCards mobil kartta "tek metrik"i
        // hep SONUNCU `rest` alanından seçtiği için mobil kart etiketsiz/birimsiz çıplak bir
        // tamsayı ("0") basıyordu — masaüstünde bu sayıya anlamı "Açık iş emri" sütun başlığı
        // veriyordu, mobilde başlık yok. Aynı hamlede modülün en değerli alanı "Sonraki bakım"
        // (nextDueAt) karttan tamamen düşüyordu. `mobile:'hidden'` ile bu sütun mobil kart
        // hesabından tamamen çıkarılır (masaüstü tablosu etkilenmez — meta.mobile yalnızca
        // mobile-cards.tsx tarafından okunur) ve `rest` listesinde TEK kalan alan nextDueAt olur;
        // metrik artık kendini açıklayan bir tarih (14.09.2026), gecikmede zaten var olan
        // AlertTriangle + text-destructive ile. Bkz. /bakim/planlar — aynı yuvaya zaten tarih
        // basıyor (probe-bakim-r10e.ts), desen modül içinde tutarlı hale gelir.
        id: 'openOrderCount', accessorFn: (r) => r.openOrderCount, header: 'Açık iş emri', meta: { align: 'right', width: 100, mobile: 'hidden' },
        cell: ({ row }) => (row.original.openOrderCount > 0 ? <span className="num font-medium text-warning">{row.original.openOrderCount}</span> : <span className="num text-muted-foreground">0</span>),
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('machine') }];

  return (
    <DataTable
      columns={columns}
      data={machines}
      getRowId={(r) => r.id}
      rowHref={(r) => `/bakim/makineler/${r.id}`}
      searchPlaceholder="Makine kodu veya adı ara…"
      filters={filters}
      initialSorting={[{ id: 'code', desc: false }]}
      emptyTitle="Henüz makine kaydı yok"
      emptyDescription="Bakım seed'i çalıştırıldığında kapasite raporundaki 36 makine burada listelenir."
    />
  );
}

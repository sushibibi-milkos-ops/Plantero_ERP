'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
// Alt-yol içe aktarımı ('@plantero/core/money', barrel değil): '@plantero/core' kök giriş noktası
// index.ts üzerinden auth/session.ts'i (node:crypto kullanan sunucu-yalnızca kod) de dışa aktarıyor —
// bu 'use client' bileşeninde barrel'dan import etmek TÜM paketi (crypto dahil) tarayıcı paketine
// çekip derlemeyi kırıyordu ("node:crypto" UnhandledSchemeError). Yalnızca saf money.ts alınır.
import { D } from '@plantero/core/money';
import type { CountRow } from '../queries';

// Kök neden (Tur 5 P2): "Fark değeri" `MoneyCell signed` ile turuncu basılıyordu — ama turuncu bu
// modülde tutarlı biçimde "SKT yaklaşıyor" anlamı taşır (stok/skt/lotlar ekranları). Aynı rengi
// sayım farkına da yüklemek renk disiplinini bozar: renk yalnızca TEK bir anlam taşımalı. Fark
// değeri artık varsayılan olarak nötr; yalnızca tanımlı bir tolerans eşiğini (sistem değerinin
// %2'si) aşan gerçek bir tutarsızlıkta renklenir.
const VARIANCE_TOLERANCE_PCT = 2;

function varianceIsAnomalous(varianceValue: string, systemValue: string): boolean {
  const variance = D(varianceValue).abs();
  if (variance.isZero()) return false;
  const system = D(systemValue).abs();
  if (system.isZero()) return true; // referans değer yok ama fark var — kendi başına anlamlı
  return variance.div(system).mul(100).gt(VARIANCE_TOLERANCE_PCT);
}

export function CountsTable({ counts }: { counts: CountRow[] }) {
  const columns = useMemo<ColumnDef<CountRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { width: 150, mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'subtitle' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="count" /> },
      { accessorKey: 'lineCount', header: 'Satır', meta: { align: 'right', width: 80, mobile: 'hidden' } },
      { accessorKey: 'countDate', header: 'Sayım tarihi', meta: { width: 130 }, cell: ({ row }) => formatDate(row.original.countDate) },
      {
        accessorKey: 'varianceValue',
        header: 'Fark değeri',
        meta: { align: 'right', width: 130 },
        cell: ({ row }) => {
          const anomalous = varianceIsAnomalous(row.original.varianceValue, row.original.systemValue);
          // `signed` MoneyCell'in kendi renk mantığını (negatif=destructive, pozitif=warning) tetikler
          // — tolerans içindeyken bu doğrudan ezilir (`text-foreground`, tailwind-merge aynı renk
          // grubunda son sınıfı kazandırır), yalnızca anomali durumunda MoneyCell'in kendi rengi kalır.
          return <MoneyCell value={row.original.varianceValue} signed className={anomalous ? undefined : 'text-foreground'} />;
        },
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('count') }];

  return (
    <DataTable
      columns={columns}
      data={counts}
      getRowId={(r) => r.id}
      rowHref={(r) => `/depo/sayim/${r.id}`}
      searchPlaceholder="Belge no ara…"
      filters={filters}
      initialSorting={[{ id: 'countDate', desc: true }]}
      emptyTitle="Henüz sayım yok"
    />
  );
}

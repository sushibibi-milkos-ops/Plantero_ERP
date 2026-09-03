'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { WorkOrderRow } from '../queries';

/**
 * Mobil kart: eskiden `DataTable`'ın varsayılan kart düzeni "kalan alanlar ≤2 ise dikey" kuralına
 * takılıyordu — bu tabloda kalan alan tam olarak 2 (Planlanan, Üretilen), her ikisi de etiket
 * üstte/değer altta 2 satır alıp kartı 130px'e şişiriyordu (8 kayıt 1040px, 390px'te 5 kayıt bile
 * görünmüyordu — Tur 3 bulgusu, P1). Tek satırlık "Planlanan / Üretilen" özeti kartı ~92px'e indirdi
 * ama 5 dikey katman (docNo, ürün adı, HAT·tarih, hairline, özet satırı) yine de 118px'e çıkıyordu
 * (Tur 10 bulgusu, P1 — hedef 56-72px). 2 satıra indirildi: üstte ürün adı (birincil) + durum rozeti,
 * altta docNo·HAT·tarih meta (soldan) ve Planlanan/Üretilen özeti (sağdan) — hairline'lı ayrı bölme
 * kaldırıldı. Ortak `mobile-cards.tsx` değiştirilmedi — `DataTable`'ın zaten desteklediği
 * `renderMobileCard` ile bu tabloya özel çizilir.
 *
 * Tur 11 P1 (uretim-is-emirleri-02): mobil kartta sütun başlığı yok, dolayısıyla masaüstündeki
 * "birim → başlığa taşınır" kısayolu (`uniformUom`) burada birimi tamamen görünmez kılıyordu
 * ("90 / 0"). Mobil kart artık `uniformUom`'u yok sayıp birimi her zaman değerin yanında basar.
 */
function WorkOrderMobileCard({ wo }: { wo: WorkOrderRow }) {
  return (
    <div className="cursor-pointer rounded-lg border border-border/70 bg-card p-3 active:bg-accent/50">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 truncate text-[14px] font-medium">{wo.productName}</div>
        <StatusBadge status={wo.status} kind="work_order" />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground/70">
          <span className="truncate">{wo.docNo}</span>
          <span aria-hidden>·</span>
          <span>{wo.lineCode}</span>
          <span aria-hidden>·</span>
          <span>{wo.plannedStart ? formatDate(wo.plannedStart) : '—'}</span>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums">
          <QtyCell value={wo.plannedQty} uom={wo.uomCode} className="inline-flex" /> / <QtyCell value={wo.producedQty} uom={wo.uomCode} className="inline-flex" />
        </span>
      </div>
    </div>
  );
}

export function WorkOrdersTable({ workOrders }: { workOrders: WorkOrderRow[] }) {
  // /uretim/hatlar kartındaki hat başlığı buraya `?hat=HAT1` ile bağlanır — sayfa açılışında hat
  // sütununu ön filtreler (DataTable'ın kendi arama/filtre kutuları hâlâ değiştirilebilir).
  const searchParams = useSearchParams();
  const hatParam = searchParams.get('hat');
  const initialColumnFilters = useMemo(() => (hatParam ? [{ id: 'lineCode', value: [hatParam] }] : []), [hatParam]);

  // Sütun genelinde birim tekilse ("hepsi ADET") başlığa taşınır, hücreden kaldırılır — aksi halde
  // (karışık ADET/KG) mevcut davranış (hücre başına birim) korunur. 8 satır × 3 sütunda 24 tekrarlı
  // "ADET" yerine tek başlık eki (Tur 2 bulgusu).
  const uniformUom = useMemo(() => {
    const codes = new Set(workOrders.map((w) => w.uomCode));
    return codes.size === 1 ? workOrders[0]?.uomCode : null;
  }, [workOrders]);

  const columns = useMemo<ColumnDef<WorkOrderRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'İş emri', meta: { mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'subtitle' }, cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.productName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{row.original.sku}</div>
        </div>
      ) },
      { accessorKey: 'lineCode', header: 'Hat', meta: { width: 88, mobile: 'meta' }, cell: ({ row }) => <span className="font-mono text-xs">{row.original.lineCode}</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="work_order" /> },
      // noSort (yalnızca birim başlığa taşındığında): sıralama okunun büyüyen başlık metnine
      // ("Planlanan (ADET)") eklediği buton dolgusu sütun genişliğini geri şişirmesin diye kaldırılır
      // — bu tabloda varsayılan sıralama zaten Başlangıç'a göre, miktar sıralaması nadiren kullanılır.
      { accessorKey: 'plannedQty', header: uniformUom ? `Planlanan (${uniformUom})` : 'Planlanan', meta: { align: 'right', width: 110, noSort: Boolean(uniformUom) }, cell: ({ row }) => <QtyCell value={row.original.plannedQty} uom={uniformUom ? undefined : row.original.uomCode} /> },
      { accessorKey: 'producedQty', header: uniformUom ? `Üretilen (${uniformUom})` : 'Üretilen', meta: { align: 'right', width: 110, noSort: Boolean(uniformUom) }, cell: ({ row }) => <QtyCell value={row.original.producedQty} uom={uniformUom ? undefined : row.original.uomCode} /> },
      // width 92 → 72: masaüstü içerik alanına (~1096px) 9 görünür sütun sığmıyordu (Tur 2 bulgusu).
      { accessorKey: 'yieldPct', header: 'Verim', meta: { align: 'right', width: 72, mobile: 'hidden' }, cell: ({ row }) => (row.original.yieldPct ? <span className="num text-xs">%{Number(row.original.yieldPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span> : <span className="text-muted-foreground">—</span>) },
      { accessorKey: 'scrapQty', header: uniformUom ? `Fire (${uniformUom})` : 'Fire', meta: { align: 'right', width: 90, mobile: 'hidden', noSort: Boolean(uniformUom) }, cell: ({ row }) => (Number(row.original.scrapQty) > 0 ? <QtyCell value={row.original.scrapQty} uom={uniformUom ? undefined : row.original.uomCode} className="text-destructive" /> : <span className="text-muted-foreground">—</span>) },
      // `defaultHidden`: masaüstünde 1440px'de 11 sütun sığmıyordu (ölçüldü ~1408px > ~1152px içerik
      // alanı) — Operatör ve Birim maliyet en az başvurulan iki sütun, sütun seçiciden açılabilir.
      // Başlık 'Planlanan başlangıç' → 'Başlangıç' + width 130 → 96: 9 görünür sütun 1096px içerik
      // alanına sığmıyordu (Tur 2 bulgusu).
      { accessorKey: 'plannedStart', header: 'Başlangıç', meta: { width: 96, mobile: 'meta' }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.plannedStart ? formatDate(row.original.plannedStart) : '—'}</span> },
      { accessorKey: 'operatorName', header: 'Operatör', meta: { width: 130, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => row.original.operatorName ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: 'unitCost', header: 'Birim maliyet', meta: { align: 'right', width: 110, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => <MoneyCell value={row.original.unitCost} digits={4} muted={Number(row.original.unitCost) === 0} /> },
    ],
    [uniformUom],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('work_order') },
    { columnId: 'lineCode', title: 'Hat', options: Array.from(new Set(workOrders.map((w) => w.lineCode))).map((v) => ({ value: v, label: v })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={workOrders}
      getRowId={(r) => r.id}
      rowHref={(r) => `/uretim/is-emirleri/${r.id}`}
      searchPlaceholder="İş emri no, ürün ara…"
      filters={filters}
      initialSorting={[{ id: 'plannedStart', desc: true }]}
      initialColumnFilters={initialColumnFilters}
      emptyTitle="Henüz iş emri yok"
      emptyDescription="Üretim planlamak için “Yeni iş emri” ile başlayın."
      renderMobileCard={(r) => <WorkOrderMobileCard wo={r} />}
    />
  );
}

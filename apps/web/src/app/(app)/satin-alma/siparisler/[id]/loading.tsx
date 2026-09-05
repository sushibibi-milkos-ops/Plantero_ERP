import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table';

/**
 * Tur 6 P1 tedarik-loading-01 (bkz. `/satin-alma/tedarikciler/loading.tsx` notu) — bu rotanın gerçek
 * düzeni (PageHeader + sağda "Toplam" bloğu + durum rozeti satırı + satır tablosu + Ara toplam/KDV/
 * Genel toplam özeti, KPI şeridi YOK) `page.tsx` ile birebir; genel `(app)/loading.tsx` bunu bilmiyor.
 */
export default function PurchaseOrderDetailLoading() {
  return (
    <div className="space-y-3" aria-busy aria-label="Sipariş detayı yükleniyor">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-28" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      </div>
      <DataTableSkeleton rows={4} headers={['Ürün', 'Sipariş', 'Alınan', 'Faturalanan', 'Birim fiyat', 'KDV', 'Tutar']} />
      <div className="mt-3 flex justify-end">
        <div className="w-full max-w-[240px] space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}

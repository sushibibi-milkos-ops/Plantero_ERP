import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table';

/**
 * Tur 6 P1 tedarik-loading-01 kök neden: modülün 6 rota segmentinden hiçbirinde `loading.tsx`/
 * `error.tsx` yoktu (kriter 7 modül genelinde 4'te sıkışıyordu) — `/satis`, `/ana-veri` gibi diğer
 * modüllerde her segmentin kendi iskeleti var. Genel `(app)/loading.tsx` bu sayfanın gerçek düzenini
 * (araç çubuğu + 8 sütunlu tablo, KPI YOK) bilmiyor; rota özel iskelet `/satis/siparisler/loading.tsx`
 * ile aynı kalıp (PageHeader + araç çubuğu + `DataTableSkeleton`, gerçek başlıklarla).
 */
export default function SuppliersLoading() {
  return (
    <div className="space-y-3" aria-busy aria-label="Tedarikçiler yükleniyor">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <DataTableSkeleton
        rows={6}
        headers={['Tedarikçi', 'Kod', 'Beyaz liste', 'Tedarik süresi', 'Kalite', 'Zamanında', 'Ürün', 'Açık sipariş']}
      />
    </div>
  );
}

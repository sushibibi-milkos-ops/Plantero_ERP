import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';

/**
 * Depo detay sayfaları (mal kabul / sevkiyat / transfer / lot / sayım [id]) için ortak yükleniyor
 * iskeleti. Önceden 5 detay route'unda hiç `loading.tsx` yoktu — navigasyonda ekran donmuş gibi
 * görünüyordu (liste route'larının 10'unda skeleton varken; Tur 3 P1 bulgusu). Başlık gerçek metin
 * yerine kısa/genel bir belge no + rozet iskeleti, isteğe bağlı belge zinciri şeridi, tablo sütun
 * başlıkları gerçek metin (sayfa yapısı yüklenmeden önce zaten bilindiği için gizlenmez).
 */
export function StockDetailSkeleton({
  eyebrow,
  chain = false,
  tableHeaders,
}: {
  eyebrow: string;
  /** Belge zinciri şeridi gösteren sayfalarda (mal kabul, sevkiyat) true */
  chain?: boolean;
  tableHeaders: string[];
}) {
  return (
    <div aria-busy aria-label="Yükleniyor">
      <PageHeader
        eyebrow={eyebrow}
        title={<Skeleton className="h-6 w-40" />}
        description={<Skeleton className="h-4 w-56" />}
      />
      {chain ? (
        <div className="mb-6 flex items-center gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-44 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : null}
      <DataTableSkeleton headers={tableHeaders} rows={5} />
    </div>
  );
}

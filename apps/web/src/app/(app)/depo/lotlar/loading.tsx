import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';

/** /depo/lotlar: KPI şeridi yok, doğrudan tablo — başlık ve sütun başlıkları gerçek metin. */
export default function LotsLoading() {
  return (
    <div aria-busy>
      <PageHeader title="Lotlar" description={<Skeleton className="h-4 w-64" />} />
      <DataTableSkeleton headers={['Lot no', 'Ürün', 'Durum', 'Eldeki', 'Maliyet', 'Lokasyon', 'SKT']} />
    </div>
  );
}

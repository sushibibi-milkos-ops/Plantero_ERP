import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';
import { KpiStripRow } from '@/components/kpi-strip';

/**
 * /depo/stok'a özel iskelet: gerçek düzenle birebir (başlık + KPI şeridi + tablo).
 * Başlık gerçek metinle basılır (yalnızca açıklamadaki dinamik sayı bilinmediğinden o kısım
 * iskelet kalır) — Linear/Stripe sayfa kimliğini asla gri kutuya çevirmez, yalnızca veri hücrelerini.
 */
export default function StockLoading() {
  return (
    <div aria-busy>
      <PageHeader title="Stok" description={<Skeleton className="h-4 w-40" />} />
      <KpiStripRow>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-[140px] shrink-0 rounded-lg md:h-20 md:w-auto md:flex-1 md:rounded-none" />
        ))}
      </KpiStripRow>
      <DataTableSkeleton headers={['Ürün', 'SKU', 'Tip', 'Eldeki', 'Kullanılabilir', 'Değer', 'En yakın SKT']} />
    </div>
  );
}

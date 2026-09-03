import { StockDetailSkeleton } from '@/modules/stock/components/detail-loading';

export default function CountDetailLoading() {
  return <StockDetailSkeleton eyebrow="Sayım" tableHeaders={['Ürün', 'Lokasyon', 'Sistem', 'Sayılan', 'Fark', 'Fark değeri']} />;
}

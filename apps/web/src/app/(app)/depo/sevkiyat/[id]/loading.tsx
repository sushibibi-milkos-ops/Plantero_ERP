import { StockDetailSkeleton } from '@/modules/stock/components/detail-loading';

export default function DeliveryDetailLoading() {
  return <StockDetailSkeleton eyebrow="Sevkiyat" chain tableHeaders={['Ürün', 'Talep', 'Toplanan', 'Lot', 'SKT', 'Kaynak lokasyon']} />;
}

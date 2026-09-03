import { StockDetailSkeleton } from '@/modules/stock/components/detail-loading';

export default function TransferDetailLoading() {
  return <StockDetailSkeleton eyebrow="Transfer" tableHeaders={['Ürün', 'Lot', 'Miktar', 'Kaynak lokasyon']} />;
}

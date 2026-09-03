import { StockDetailSkeleton } from '@/modules/stock/components/detail-loading';

export default function LotDetailLoading() {
  return <StockDetailSkeleton eyebrow="Lot" tableHeaders={['Lokasyon', 'Kullanım', 'Eldeki', 'Rezerve']} />;
}

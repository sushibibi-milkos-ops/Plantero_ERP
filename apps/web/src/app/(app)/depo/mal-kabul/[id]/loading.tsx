import { StockDetailSkeleton } from '@/modules/stock/components/detail-loading';

export default function ReceiptDetailLoading() {
  return <StockDetailSkeleton eyebrow="Mal kabul" chain tableHeaders={['Ürün', 'Miktar', 'Birim maliyet', 'Lot', 'Karar', 'Lokasyon', 'Red miktarı']} />;
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getDeliveryDetail } from '@/modules/stock/queries';
import { DeliveryActions } from '@/modules/stock/components/delivery-actions';
import { DeliveryLinesTable } from '@/modules/stock/components/delivery-lines-table';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DocumentChain } from '@/components/document-chain';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Sevkiyat Detayı' };
export const dynamic = 'force-dynamic';

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('stock.pick');
  const detail = await getDeliveryDetail(id);
  if (!detail) notFound();
  const { delivery, partner, warehouse, lines, chain } = detail;
  // Az satırlı belgelerde (≤5) sınırsız genişlikte bir sayfa altında yüzlerce piksel boş kalıyordu
  // (Tur 4 P2 bulgusu: 2 satırda ~650px boşluk). Belge zinciri (varsa) genişlikten faydalanabildiği
  // için yalnızca satır sayısı azsa daraltılır.
  const isSparse = lines.length <= 5;

  return (
    <div className={isSparse ? 'max-w-5xl' : undefined}>
      {/* Önceki sürüm 4 satıra yayılıyordu (eyebrow "SEVKİYAT" / belge no / müşteri·depo ayrı satırda /
          rozet ayrı satırda) ve ~150px dikey yer kaplıyordu. Eyebrow kaldırıldı (rota zaten breadcrumb'ta
          "Sevkiyat" gösteriyor); belge no + durum rozeti aynı satıra alındı; müşteri·depo tek açıklama
          satırında kaldı — başlık bloğu artık 2 satır. Planlanan/sevk/teslim/kargo tarihleri (varsa)
          ayrı, üçüncü bir bağlam satırında — bunlar kimlik değil ek bilgi. */}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{delivery.docNo}</span>
            <StatusBadge status={delivery.status} kind="delivery" size="md" />
          </span>
        }
        description={`${partner?.name ?? ''} · ${warehouse?.name ?? ''}`}
        actions={<DeliveryActions deliveryId={delivery.id} status={delivery.status} canPick={userCan(user, 'stock.pick')} />}
      >
        {delivery.scheduledDate || delivery.shippedAt || delivery.deliveredAt || delivery.carrier ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {delivery.scheduledDate ? <span>Planlanan {formatDate(delivery.scheduledDate)}</span> : null}
            {delivery.shippedAt ? <span>Sevk: {formatDateTime(delivery.shippedAt)}</span> : null}
            {delivery.deliveredAt ? <span>Teslim: {formatDateTime(delivery.deliveredAt)}</span> : null}
            {delivery.carrier ? <span>Kargo: {delivery.carrier}</span> : null}
          </div>
        ) : null}
      </PageHeader>

      {chain.upstream.length || chain.downstream.length ? (
        <div className="mb-6">
          <DocumentChain upstream={chain.upstream} current={{ type: 'delivery', id: delivery.id, docNo: delivery.docNo, status: delivery.status, date: delivery.createdAt, amount: null, partnerName: partner?.name ?? null }} downstream={chain.downstream} />
        </div>
      ) : null}

      <DeliveryLinesTable lines={lines} />
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getDeliveryDetail } from '@/modules/stock/queries';
import { DeliveryActions } from '@/modules/stock/components/delivery-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { DocumentChain } from '@/components/document-chain';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Sevkiyat Detayı' };
export const dynamic = 'force-dynamic';

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('stock.pick');
  const detail = await getDeliveryDetail(id);
  if (!detail) notFound();
  const { delivery, partner, warehouse, lines, chain } = detail;

  return (
    <>
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

      <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right">Talep</TableHead>
              <TableHead className="text-right">Toplanan</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>SKT</TableHead>
              <TableHead>Kaynak lokasyon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.line.id}>
                <TableCell>
                  <div className="font-medium">{l.productName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{l.sku}</div>
                </TableCell>
                <TableCell className="text-right"><QtyCell value={l.line.qty} uom={l.uomCode} /></TableCell>
                <TableCell className="text-right"><QtyCell value={l.line.pickedQty} uom={l.uomCode} /></TableCell>
                <TableCell>{l.lotNo ? <LotBadge lotNo={l.lotNo} status={l.lotStatus} id={l.line.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>}</TableCell>
                <TableCell>{l.expiryDate ? <ExpiryBadge date={l.expiryDate} showDate={false} /> : <span className="text-xs text-muted-foreground/60">—</span>}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.locationCode ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

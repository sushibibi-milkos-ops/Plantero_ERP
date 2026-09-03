import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getTransferDetail } from '@/modules/stock/queries';
import { TransferActions } from '@/modules/stock/components/transfer-actions';
import { TransferLinesTable } from '@/modules/stock/components/transfer-lines-table';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Transfer Detayı' };
export const dynamic = 'force-dynamic';

export default async function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('stock.view');
  const detail = await getTransferDetail(id);
  if (!detail) notFound();
  const { transfer, lines, fromWarehouse, toWarehouse } = detail;

  return (
    <>
      <PageHeader
        eyebrow="Transfer"
        title={<span className="font-mono">{transfer.docNo}</span>}
        description={`${fromWarehouse?.code ?? ''} → ${toWarehouse?.code ?? ''}`}
        actions={<TransferActions transferId={transfer.id} status={transfer.status} canTransfer={userCan(user, 'stock.transfer')} />}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={transfer.status} kind="transfer" size="md" />
          {transfer.scheduledDate ? <span className="text-muted-foreground">Planlanan {formatDate(transfer.scheduledDate)}</span> : null}
          {transfer.doneAt ? <span className="text-muted-foreground">Tamamlandı: {formatDateTime(transfer.doneAt)}</span> : null}
          {transfer.reason ? <span className="text-muted-foreground">Sebep: {transfer.reason}</span> : null}
        </div>
      </PageHeader>

      <TransferLinesTable lines={lines} />
    </>
  );
}

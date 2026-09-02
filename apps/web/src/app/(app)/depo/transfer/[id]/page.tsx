import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getTransferDetail } from '@/modules/stock/queries';
import { TransferActions } from '@/modules/stock/components/transfer-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { QtyCell } from '@/components/qty-cell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

      <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ürün</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead className="text-right">Miktar</TableHead>
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
                <TableCell>{l.lotNo ? <LotBadge lotNo={l.lotNo} id={l.line.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>}</TableCell>
                <TableCell className="text-right"><QtyCell value={l.line.qty} uom={l.uomCode} /></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.fromCode}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { getReceiptDetail } from '@/modules/stock/queries';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { DocumentChain } from '@/components/document-chain';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RECEIPT_DISPOSITION_LABELS } from '@/modules/stock/labels';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Mal Kabul Detayı' };
export const dynamic = 'force-dynamic';

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('stock.view');
  const detail = await getReceiptDetail(id);
  if (!detail) notFound();
  const { receipt, partner, warehouse, lines, chain } = detail;

  return (
    <>
      <PageHeader
        eyebrow="Mal kabul"
        title={<span className="font-mono">{receipt.docNo}</span>}
        description={`${partner?.name ?? 'Cari yok'} · ${warehouse?.name ?? ''}`}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={receipt.status} kind="receipt" size="md" />
          {receipt.wasOnTime === true ? <StatusBadge status="on_time" label="Zamanında" tone="success" /> : receipt.wasOnTime === false ? <StatusBadge status="late" label="Geç" tone="danger" /> : null}
          {receipt.supplierDeliveryNo ? <span className="text-muted-foreground">İrsaliye: {receipt.supplierDeliveryNo}{receipt.supplierDeliveryDate ? ` (${formatDate(receipt.supplierDeliveryDate)})` : ''}</span> : null}
          {receipt.receivedAt ? <span className="text-muted-foreground">Kabul: {formatDateTime(receipt.receivedAt)}</span> : null}
        </div>
      </PageHeader>

      {chain.upstream.length || chain.downstream.length ? (
        <div className="mb-6">
          <DocumentChain upstream={chain.upstream} current={{ type: 'receipt', id: receipt.id, docNo: receipt.docNo, status: receipt.status, date: receipt.createdAt, amount: null, partnerName: partner?.name ?? null }} downstream={chain.downstream} />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right">Miktar</TableHead>
              <TableHead className="text-right">Birim maliyet</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Karar</TableHead>
              <TableHead>Lokasyon</TableHead>
              <TableHead className="text-right">Red miktarı</TableHead>
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
                <TableCell className="text-right"><MoneyCell value={l.line.unitCost} digits={4} /></TableCell>
                <TableCell>{l.lotNo ? <LotBadge lotNo={l.lotNo} status={l.lotStatus} id={l.line.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>}</TableCell>
                <TableCell><StatusBadge status={l.line.disposition} label={RECEIPT_DISPOSITION_LABELS[l.line.disposition] ?? l.line.disposition} tone={l.line.disposition === 'rejected' ? 'danger' : l.line.disposition === 'quarantine' ? 'warning' : 'success'} /></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.locationCode ?? '—'}</TableCell>
                <TableCell className="text-right">{Number(l.line.rejectedQty) > 0 ? <QtyCell value={l.line.rejectedQty} uom={l.uomCode} /> : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

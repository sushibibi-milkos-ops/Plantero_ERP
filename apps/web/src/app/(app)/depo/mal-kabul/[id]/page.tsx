import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { getReceiptDetail } from '@/modules/stock/queries';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DocumentChain } from '@/components/document-chain';
import { ReceiptLinesTable } from '@/modules/stock/components/receipt-lines-table';
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

      <ReceiptLinesTable lines={lines} />
    </>
  );
}

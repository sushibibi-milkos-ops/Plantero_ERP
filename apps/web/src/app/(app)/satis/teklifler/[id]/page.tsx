import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getSalesDocDetail } from '@/modules/sales/queries';
import { SalesDocLines } from '@/modules/sales/components/sales-doc-lines';
import { SalesDocSummary } from '@/modules/sales/components/sales-doc-summary';
import { QuotationActions } from '@/modules/sales/components/quotation-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DocumentChain } from '@/components/document-chain';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Teklif Detayı' };
export const dynamic = 'force-dynamic';

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('sales.quote');
  const detail = await getSalesDocDetail(id);
  if (!detail || detail.order.docType !== 'quotation') notFound();
  const { order, partnerName, channelName, lines, chain } = detail;

  return (
    <>
      <PageHeader
        eyebrow="Teklif"
        title={<span className="font-mono">{order.docNo}</span>}
        description={`${partnerName} · ${channelName}${order.validUntil ? ` · Geçerlilik: ${formatDate(order.validUntil)}` : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge status={order.status} kind="sales_order" size="md" />
          {userCan(user, 'sales.order') || userCan(user, 'sales.quote') ? <QuotationActions id={order.id} status={order.status} canOrder={['sent', 'accepted'].includes(order.status)} /> : null}
        </div>
      </PageHeader>

      {chain.upstream.length || chain.downstream.length ? (
        <div className="mb-6">
          <DocumentChain
            upstream={chain.upstream}
            current={{ type: 'quotation', id: order.id, docNo: order.docNo, status: order.status, date: order.createdAt, amount: order.grandTotal, partnerName }}
            downstream={chain.downstream}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesDocLines lines={lines} currency={order.currency} showProgress={false} />
        </div>
        <SalesDocSummary order={order} showChannelDeductions={false} />
      </div>

      {order.note ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-card p-4 text-sm whitespace-pre-wrap text-muted-foreground">{order.note}</div>
      ) : null}
    </>
  );
}

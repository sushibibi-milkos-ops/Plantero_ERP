import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getSalesDocDetail } from '@/modules/sales/queries';
import { SalesDocLines } from '@/modules/sales/components/sales-doc-lines';
import { SalesDocSummary } from '@/modules/sales/components/sales-doc-summary';
import { OrderActions } from '@/modules/sales/components/order-actions';
import { DeliveryInvoiceButton } from '@/modules/sales/components/delivery-invoice-button';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { DocumentChain } from '@/components/document-chain';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Sipariş Detayı' };
export const dynamic = 'force-dynamic';

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('sales.view');
  const detail = await getSalesDocDetail(id);
  if (!detail || detail.order.docType !== 'order') notFound();
  const { order, partnerName, channelName, warehouseName, lines, deliveries, invoices, chain } = detail;

  // Belge zinciri kartlarında cari adı yalnızca zincirde birden fazla farklı cari varsa gösterilir
  // (aksi halde aynı müşteri adı 5 kartta tekrar edip kırpılıyordu). DocumentChain ortak bileşen
  // olduğundan (apps/web/src/components) burada değiştirilmiyor; düğümler kendi belgemizde süzülüyor.
  const chainPartnerNames = new Set(
    [...chain.upstream, ...chain.downstream].map((n) => n.partnerName).filter((n): n is string => Boolean(n)),
  );
  chainPartnerNames.add(partnerName);
  const dedupeChainNode = <T extends { partnerName?: string | null }>(n: T): T =>
    chainPartnerNames.size > 1 ? n : { ...n, partnerName: null };
  const chainUpstream = chain.upstream.map(dedupeChainNode);
  const chainDownstream = chain.downstream.map(dedupeChainNode);

  return (
    <>
      <PageHeader
        eyebrow="Satış siparişi"
        title={<span className="font-mono">{order.docNo}</span>}
        description={`${partnerName} · ${channelName} · ${warehouseName}${order.externalOrderNo ? ` · Dış no: ${order.externalOrderNo}` : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge status={order.status} kind="sales_order" size="md" />
          {userCan(user, 'sales.confirm') || userCan(user, 'accounting.invoice') ? <OrderActions id={order.id} status={order.status} hasDeliveries={deliveries.length > 0} /> : null}
        </div>
      </PageHeader>

      {chain.upstream.length || chain.downstream.length ? (
        <div className="mb-6">
          <DocumentChain
            upstream={chainUpstream}
            current={{ type: 'sales_order', id: order.id, docNo: order.docNo, status: order.status, date: order.createdAt, amount: order.grandTotal, partnerName: chainPartnerNames.size > 1 ? partnerName : null }}
            downstream={chainDownstream}
          />
        </div>
      ) : null}

      {/* min-w-0: grid item'ların varsayılan min-width:auto'su, içindeki nowrap tablo/özet genişliğini
          sütun genişliğine sıkıştırmayı engelleyip sayfayı 390px'te yatay taşırıyordu. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <SalesDocLines lines={lines} currency={order.currency} showProgress />

          {deliveries.length ? (
            <div className="rounded-lg border border-border/70 bg-card">
              <div className="border-b border-border/60 px-4 py-2.5 text-[13px] font-medium text-muted-foreground">İrsaliyeler</div>
              <div className="scrollbar-thin overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Belge no</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Planlanan</TableHead>
                      <TableHead>Sevk</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((d) => {
                      const invoiced = invoices.some((i) => i.deliveryId === d.id);
                      return (
                        <TableRow key={d.id}>
                          <TableCell><Link href={`/depo/sevkiyat/${d.id}`} className="font-mono text-xs text-primary hover:underline">{d.docNo}</Link></TableCell>
                          <TableCell><StatusBadge status={d.status} kind="delivery" /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.scheduledDate ? formatDate(d.scheduledDate) : '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.shippedAt ? formatDate(d.shippedAt) : '—'}</TableCell>
                          <TableCell className="text-right">
                            {['shipped', 'delivered'].includes(d.status) && !invoiced && userCan(user, 'accounting.invoice') ? <DeliveryInvoiceButton deliveryId={d.id} /> : invoiced ? <span className="text-xs text-muted-foreground">Faturalandı</span> : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          {invoices.length ? (
            <div className="rounded-lg border border-border/70 bg-card">
              <div className="border-b border-border/60 px-4 py-2.5 text-[13px] font-medium text-muted-foreground">Faturalar</div>
              <div className="scrollbar-thin overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Belge no</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Vade</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                      <TableHead className="text-right">Kalan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell><Link href={`/muhasebe/faturalar/${inv.id}`} className="font-mono text-xs text-primary hover:underline">{inv.docNo}</Link></TableCell>
                        <TableCell><StatusBadge status={inv.status} kind="invoice" /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(inv.invoiceDate)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-right"><MoneyCell value={inv.grandTotal} currency={inv.currency} /></TableCell>
                        <TableCell className="text-right"><MoneyCell value={inv.residual} currency={inv.currency} muted={Number(inv.residual) === 0} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
        <div className="min-w-0 lg:h-fit">
          <SalesDocSummary order={order} showChannelDeductions />
        </div>
      </div>

      {order.note ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-card p-4 text-sm whitespace-pre-wrap text-muted-foreground">{order.note}</div>
      ) : null}
    </>
  );
}

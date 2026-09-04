import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, Package } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { getShipmentDetail, listResponsibleUsers } from '@/modules/export/queries';
import { ShipmentActions } from '@/modules/export/components/shipment-actions';
import { LogisticsPanel } from '@/modules/export/components/logistics-panel';
import { PackingListTable } from '@/modules/export/components/packing-list-table';
import { DocumentsTable } from '@/modules/export/components/documents-table';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { DocumentChain } from '@/components/document-chain';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatQty } from '@/lib/format';
import { D } from '@plantero/core';

export const metadata: Metadata = { title: 'Sevkiyat Detayı' };
export const dynamic = 'force-dynamic';

const REGIME_LABEL: Record<string, string> = { standard: 'Standart', etgb: 'ETGB (mikro ihracat)' };

export default async function ExportShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('export.view');
  const detail = await getShipmentDetail(id);
  if (!detail) notFound();
  const { shipment, partner, order, orderLines, delivery, invoice, otherDeliveries, otherInvoices, packages, documents, chain, progress } = detail;
  const responsibleUsers = await listResponsibleUsers();
  const canManage = userCan(user, 'export.manage');

  const deliveryCandidates = otherDeliveries.filter((d) => d.id !== shipment.deliveryId).map((d) => ({ id: d.id, docNo: d.docNo }));
  const invoiceCandidates = otherInvoices.filter((i) => i.id !== shipment.invoiceId).map((i) => ({ id: i.id, docNo: i.docNo, label: `${i.grandTotal} ${i.currency}` }));

  return (
    <>
      <PageHeader
        eyebrow="İhracat sevkiyatı"
        title={<span className="font-mono">{shipment.docNo}</span>}
        description={`${partner?.name ?? 'Cari yok'} · ${shipment.destinationCountry}${order ? ` · ${order.docNo}` : ''}`}
        actions={canManage ? <ShipmentActions shipmentId={shipment.id} status={shipment.status} regime={shipment.regime} deliveryId={shipment.deliveryId} invoiceId={shipment.invoiceId} deliveryCandidates={deliveryCandidates} invoiceCandidates={invoiceCandidates} /> : undefined}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={shipment.status} kind="export" size="md" />
          <span className="text-muted-foreground">{REGIME_LABEL[shipment.regime] ?? shipment.regime}</span>
          <span className="text-muted-foreground">Belgeler: {progress.done}/{progress.total}</span>
          <MoneyCell value={shipment.amountTry} className="ml-auto text-base font-semibold" />
        </div>
      </PageHeader>

      {chain.upstream.length || chain.downstream.length ? (
        <div className="mb-6">
          <DocumentChain
            upstream={chain.upstream}
            current={{ type: 'export_shipment', id: shipment.id, docNo: shipment.docNo, status: shipment.status, date: shipment.proformaDate ? new Date(shipment.proformaDate) : shipment.createdAt, amount: shipment.amountTry, partnerName: partner?.name ?? null }}
            downstream={chain.downstream}
          />
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LogisticsPanel
          shipmentId={shipment.id} incoterm={shipment.incoterm} incotermPlace={shipment.incotermPlace} destinationCountry={shipment.destinationCountry}
          portOfLoading={shipment.portOfLoading} portOfDischarge={shipment.portOfDischarge} transportMode={shipment.transportMode} carrier={shipment.carrier}
          trackingNo={shipment.trackingNo} etd={shipment.etd} eta={shipment.eta} editable={canManage}
        />
        <div className="rounded-lg border border-border/60 p-4">
          <h3 className="mb-3 text-[13px] font-semibold">Proforma &amp; gümrük</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Proforma no</div>
              <div className="text-[13px] font-medium">{shipment.proformaNo ?? <span className="font-normal text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Proforma tarihi</div>
              <div className="text-[13px] font-medium">{shipment.proformaDate ? formatDate(shipment.proformaDate) : <span className="font-normal text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Proforma tutarı</div>
              <div className="text-[13px] font-medium"><MoneyCell value={shipment.proformaAmount} currency={shipment.currency} /></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{shipment.regime === 'etgb' ? 'ETGB no' : 'Gümrük beyanname no'}</div>
              <div className="text-[13px] font-medium">{(shipment.regime === 'etgb' ? shipment.etgbNo : shipment.customsDeclarationNo) ?? <span className="font-normal text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Gümrük tarihi</div>
              <div className="text-[13px] font-medium">{shipment.customsDate ? formatDate(shipment.customsDate) : <span className="font-normal text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Kap / palet</div>
              <div className="text-[13px] font-medium">{shipment.packageCount ?? 0} kap{shipment.palletCount ? ` · ${shipment.palletCount} palet` : ''}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net / brüt ağırlık</div>
              <div className="text-[13px] font-medium">{shipment.netWeightKg ? `${formatQty(shipment.netWeightKg)} kg` : '—'} / {shipment.grossWeightKg ? `${formatQty(shipment.grossWeightKg)} kg` : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="lines" className="gap-4">
        <TabsList variant="line" className="w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-20px),transparent)]">
          <TabsTrigger value="lines" className="shrink-0 px-3 text-[13px]">Sipariş satırları</TabsTrigger>
          <TabsTrigger value="packing" className="shrink-0 px-3 text-[13px]">Çeki listesi</TabsTrigger>
          <TabsTrigger value="documents" className="shrink-0 px-3 text-[13px]">Belgeler</TabsTrigger>
          <TabsTrigger value="invoice" className="shrink-0 px-3 text-[13px]">Fatura &amp; kur</TabsTrigger>
        </TabsList>

        <TabsContent value="lines">
          {orderLines.length === 0 ? (
            <EmptyState compact title="Sipariş bulunamadı" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
                    <th className="px-3 py-2 font-medium">Ürün</th>
                    <th className="px-3 py-2 text-right font-medium">Miktar</th>
                    <th className="px-3 py-2 text-right font-medium">Sevk edilen</th>
                    <th className="px-3 py-2 text-right font-medium">Birim fiyat</th>
                    <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {orderLines.map((r) => (
                    <tr key={r.line.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.productName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatQty(r.line.qty, r.uomCode)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${D(r.line.deliveredQty).gte(D(r.line.qty)) ? 'text-success' : 'text-muted-foreground'}`}>{formatQty(r.line.deliveredQty)}</td>
                      <td className="px-3 py-2.5 text-right"><MoneyCell value={r.line.unitPrice} currency={order?.currency} /></td>
                      <td className="px-3 py-2.5 text-right"><MoneyCell value={r.line.lineTotal} currency={order?.currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="packing">
          <PackingListTable packages={packages} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTable documents={documents.map((d) => ({ id: d.id, shipmentId: shipment.id, shipmentDocNo: shipment.docNo, partnerName: partner?.name ?? '', code: d.code, name: d.name, status: d.status, docNo: d.docNo, dueDate: d.dueDate, responsibleName: d.responsibleName, shipmentStatus: shipment.status }))} responsibleUsers={responsibleUsers} />
        </TabsContent>

        <TabsContent value="invoice">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-3 text-[13px] font-semibold">İhracat faturası</h3>
              {invoice ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Link href={`/muhasebe/faturalar/${invoice.id}`} className="inline-flex items-center gap-1.5 font-mono text-[13px] hover:underline">
                      <FileText className="size-3.5 text-muted-foreground" /> {invoice.docNo}
                    </Link>
                    <StatusBadge status={invoice.status} kind="invoice" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[13px]">
                    <div>
                      <div className="text-xs text-muted-foreground">Tutar</div>
                      <MoneyCell value={invoice.grandTotal} currency={invoice.currency} />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">TL karşılığı</div>
                      <MoneyCell value={invoice.grandTotalTry} />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Kur</div>
                      <div className="font-mono tabular-nums">{invoice.exchangeRate}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Vade</div>
                      <div>{formatDate(invoice.dueDate)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Tahsil edilen</div>
                      <MoneyCell value={invoice.paidAmount} currency={invoice.currency} />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Kalan</div>
                      <MoneyCell value={invoice.residual} currency={invoice.currency} muted={D(invoice.residual).lte(0)} />
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState compact title="Henüz bağlı fatura yok" description="Sevkiyat sipariş/irsaliye üzerinden faturalandıktan sonra üstteki “Faturaya bağla” eylemiyle bağlanır." />
              )}
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-3 text-[13px] font-semibold">Kur bilgisi</h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <div className="text-xs text-muted-foreground">Para birimi</div>
                  <div className="font-medium">{shipment.currency}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Kur (TCMB)</div>
                  <div className="font-mono tabular-nums">{shipment.exchangeRate}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Kur tarihi</div>
                  <div>{shipment.exchangeRateDate ? formatDate(shipment.exchangeRateDate) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">TL karşılığı</div>
                  <MoneyCell value={shipment.amountTry} />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Kur farkı (lehte/aleyhte) faturanın kur tarihi ile tahsilat kuru arasındaki farktan tahsilat kaydında otomatik üretilir (646/656) — bkz. fatura detayındaki yevmiye fişi.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {delivery ? (
        <div className="mt-6 rounded-lg border border-border/60 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><Package className="size-3.5 text-muted-foreground" /> Bağlı irsaliye</h3>
          <div className="flex items-center justify-between text-[13px]">
            <Link href={`/depo/sevkiyat/${delivery.id}`} className="font-mono hover:underline">{delivery.docNo}</Link>
            <StatusBadge status={delivery.status} kind="delivery" />
          </div>
        </div>
      ) : null}
    </>
  );
}

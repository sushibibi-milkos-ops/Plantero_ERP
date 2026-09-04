import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission, userCan } from '@/lib/auth';
import { getInvoiceDetail } from '@/modules/accounting/queries';
import { InvoiceDetailActions } from '@/modules/accounting/components/invoice-detail-actions';
import { InvoiceLinesView } from '@/modules/accounting/components/invoice-lines-view';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { DocumentChain, type ChainNode } from '@/components/document-chain';
import { formatDate } from '@/lib/format';
import { getChain } from '@plantero/core/documents/chain';
import { db } from '@plantero/db';

export const metadata: Metadata = { title: 'Fatura Detayı' };
export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = { sales: 'Satış faturası', purchase: 'Alış faturası', sales_return: 'Satış iade faturası', purchase_return: 'Alış iade faturası' };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('accounting.view');
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, partner, lines, payments } = detail;

  const chain = await getChain(db, 'invoice', id);
  const current: ChainNode = { type: 'invoice', id: invoice.id, docNo: invoice.docNo, status: invoice.status, date: invoice.invoiceDate, amount: invoice.grandTotal, partnerName: partner.name };

  const canCredit = userCan(user, 'accounting.invoice') && ['posted', 'partially_paid', 'paid'].includes(invoice.status) && !['sales_return', 'purchase_return'].includes(invoice.kind) && !detail.linkedCreditNoteId;
  const canCancel = userCan(user, 'accounting.invoice') && invoice.status !== 'cancelled' && Number(invoice.paidAmount) === 0;
  const canSendEInvoice = userCan(user, 'accounting.einvoice') && invoice.kind === 'sales' && invoice.status !== 'cancelled';

  return (
    <>
      <PageHeader
        eyebrow={KIND_LABELS[invoice.kind] ?? invoice.kind}
        title={invoice.docNo}
        description={
          // Dikey ayraç (kritik bulgu muhasebe-fatura-detay-06 - kok neden, DUZELTME 2): "." metin
          // karakteri, hangi flex ogesine baglansa (bir onceki degerin sonuna ya da bir sonrakinin
          // basina), sarma satirdan tasinca o glifin kendisi satir basinda asili kaliyordu - ayrac
          // metin oldugu surece bu kacinilmazdi. `border-l` ile cizilen ince bir dikey cizgi ayni
          // ayirma isini gorur ama bir YAZI KARAKTERI degildir; hicbir satir bir noktalama
          // isaretiyle baslamaz (olcut tam olarak budur).
          <span className="flex flex-wrap items-center gap-y-1">
            <Link href={`/muhasebe/cariler/${partner.id}/ekstre`} className="underline decoration-dotted underline-offset-2 hover:text-foreground">{partner.name}</Link>
            <span className="ml-3 border-l border-border/60 pl-3">{formatDate(invoice.invoiceDate)}</span>
            <span className="ml-3 border-l border-border/60 pl-3">vade {formatDate(invoice.dueDate)}</span>
            {invoice.origin === 'manual' ? <span className="ml-3 border-l border-border/60 pl-3 text-muted-foreground/70">(manuel)</span> : null}
          </span>
        }
        actions={<InvoiceDetailActions invoiceId={invoice.id} canCredit={canCredit} canCancel={canCancel} canSendEInvoice={canSendEInvoice} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={invoice.status} kind="invoice" />
          {invoice.kind === 'sales' ? <StatusBadge status={invoice.eInvoiceType === 'none' ? 'not_sent' : invoice.eInvoiceStatus} kind="e_invoice" /> : null}
          {invoice.journalEntryId ? (
            <Link href={`/muhasebe/yevmiye/${invoice.journalEntryId}`} className="text-[13px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
              Yevmiye fişi ↗
            </Link>
          ) : null}
          {detail.linkedCreditNoteId ? (
            <Link href={`/muhasebe/faturalar/${detail.linkedCreditNoteId}`} className="text-[13px] text-primary underline decoration-dotted underline-offset-2">İade faturası kesildi ↗</Link>
          ) : null}
          {detail.sourceInvoiceId ? (
            <Link href={`/muhasebe/faturalar/${detail.sourceInvoiceId}`} className="text-[13px] text-muted-foreground underline decoration-dotted underline-offset-2">Kaynak fatura ↗</Link>
          ) : null}
        </div>
      </PageHeader>

      {invoice.eInvoiceError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">e-Belge hatası: {invoice.eInvoiceError}</div>
      ) : null}

      {/* Tam genişlik (1152px), grid'in DIŞINDA (tur 2 P1 muhasebe-fatura-detay-02 kök nedeni):
          önceden `lg:col-span-2` dar sol koluna (768px) sıkıştırılıyordu — 4 düğümlü zincirin son
          düğümü (mevcut belge!) kırpılıyordu. Zincir tek satır kart dizisi, formların/tabloların
          aksine sağ kolonla genişlik paylaşmasına gerek yok. */}
      {(chain.upstream.length || chain.downstream.length) ? (
        <div className="mb-6">
          <div className="mb-2 text-[13px] font-medium text-muted-foreground">Belge zinciri</div>
          <DocumentChain upstream={chain.upstream} current={current} downstream={chain.downstream} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <InvoiceLinesView lines={lines} currency={invoice.currency} subtotal={invoice.subtotal} vatTotal={invoice.vatTotal} grandTotal={invoice.grandTotal} />
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 p-4">
            <div className="mb-3 text-[13px] font-medium">Tahsilat / ödeme</div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[13px] text-muted-foreground">Kalan</span>
              <MoneyCell value={invoice.residual} currency={invoice.currency} className="text-base" />
            </div>
            {payments.length ? (
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-[13px]">
                    <div>
                      <div className="font-mono">{p.docNo}</div>
                      <div className="text-muted-foreground">{formatDate(p.paymentDate)}</div>
                    </div>
                    <MoneyCell value={p.allocatedAmount} currency={invoice.currency} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">Henüz tahsilat/ödeme yapılmadı.</p>
            )}
            {invoice.residual !== '0.0000' && invoice.status !== 'cancelled' ? (
              <Link href="/muhasebe/tahsilatlar" className="mt-3 block text-[13px] text-primary underline decoration-dotted underline-offset-2">
                Tahsilat/ödeme kaydet ↗
              </Link>
            ) : null}
          </div>

          {invoice.kind === 'sales' && invoice.eInvoiceUuid ? (
            <div className="rounded-lg border border-border/60 p-4 text-[13px]">
              <div className="mb-2 font-medium">e-Belge</div>
              <dl className="space-y-1 text-muted-foreground">
                <div className="flex justify-between gap-2"><dt>Tür</dt><dd className="text-foreground">{invoice.eInvoiceType}</dd></div>
                <div className="flex justify-between gap-2"><dt>UUID</dt><dd className="truncate font-mono text-[11px] text-foreground" title={invoice.eInvoiceUuid}>{invoice.eInvoiceUuid}</dd></div>
                {invoice.eInvoiceNo ? <div className="flex justify-between gap-2"><dt>GİB no</dt><dd className="font-mono text-foreground">{invoice.eInvoiceNo}</dd></div> : null}
                <div className="flex justify-between gap-2"><dt>Gönderim</dt><dd className="text-foreground">{invoice.eInvoiceSentAt ? formatDate(invoice.eInvoiceSentAt) : '—'}</dd></div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

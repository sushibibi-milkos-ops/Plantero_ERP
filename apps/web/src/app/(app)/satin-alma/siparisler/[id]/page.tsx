import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { getPurchaseOrderDetail } from '@/modules/purchasing/queries';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { DocumentChain } from '@/components/document-chain';
import { OrderLinesTable } from '@/modules/purchasing/components/order-lines-table';
import { OrderActions } from '@/modules/purchasing/components/order-actions';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Sipariş Detayı' };
export const dynamic = 'force-dynamic';

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('purchasing.view');
  const detail = await getPurchaseOrderDetail(id);
  if (!detail) notFound();
  const { po, partner, warehouse, lines, receipts, invoices, chain } = detail;

  return (
    <>
      <PageHeader
        eyebrow="Satın alma siparişi"
        title={<span className="font-mono">{po.docNo}</span>}
        description={`${partner?.name ?? 'Cari yok'} · ${warehouse?.name ?? ''}`}
        actions={
          // Tur 1 P1 tedarik-po-detay-02 kök neden: toplam eskiden aşağıdaki meta şeridinin İÇİNDE
          // `ml-auto` ile duruyordu — şerit sarınca (390px) tutar bir gönderim zaman damgasının
          // hemen yanına yapışıyor, belgenin en önemli sayısı etiketsiz + 16px basılıyordu. Kendi
          // bloğuna (PageHeader'ın `actions` yuvası — meta akışından tamamen ayrık, her genişlikte
          // sabit konumda) alındı: 11px muted etiket + 20px/600 tabular-nums değer. TEK bir sarmalayıcı
          // (PageHeader'ın `[&>*]:flex-1` kuralı doğrudan ÇOCUKLARA uygulanıyor — iki ayrı çocuk
          // vermek mobilde toplamı ve eylem düğmelerini yan yana yarı yarıya sıkıştırırdı).
          <div className="flex w-full flex-col items-end gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <div className="text-right">
              {/* Tur 2 P1 tedarik-po-detay-03: 'Toplam' KDV dahil (grand_total) — etiket artık bunu
                  açıkça söylüyor, altındaki Ara toplam/KDV bloğu (page.tsx) tabanı doğrulanabilir kılar. */}
              <div className="text-[11px] font-medium text-muted-foreground">Toplam (KDV dahil)</div>
              <MoneyCell value={po.grandTotal} className="text-xl font-semibold tabular-nums" />
            </div>
            <OrderActions orderId={po.id} status={po.status} canApprove={userCan(user, 'purchasing.approve')} canSend={userCan(user, 'purchasing.send')} />
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={po.status} kind="purchase_order" size="md" />
          {po.isAiGenerated ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Sparkles className="size-3" /> AI taslağı{po.aiConfidence ? ` · %${Math.round(Number(po.aiConfidence) * 100)} güven` : ''}
            </span>
          ) : null}
          <span className="text-muted-foreground">Sipariş: {formatDate(po.orderDate)}</span>
          {po.expectedDate ? <span className="text-muted-foreground">Beklenen: {formatDate(po.expectedDate)}</span> : null}
          {po.sentAt ? <span className="text-muted-foreground">Gönderildi: {formatDateTime(po.sentAt)} ({po.sentVia})</span> : null}
        </div>
        {po.aiRationale ? <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">{po.aiRationale}</p> : null}
      </PageHeader>

      {chain.upstream.length || chain.downstream.length ? (
        <div className="mb-6">
          <DocumentChain upstream={chain.upstream} current={{ type: 'purchase_order', id: po.id, docNo: po.docNo, status: po.status, date: new Date(po.orderDate), amount: po.grandTotal, partnerName: partner?.name ?? null }} downstream={chain.downstream} />
        </div>
      ) : null}

      <OrderLinesTable lines={lines} />

      {/* Tur 2 P1 tedarik-po-detay-03: satır tutarları artık KDV hariç (`lineSubtotal`) basılıyor;
          belgenin toplamı (`grandTotal`, KDV dahil) ile bu satırlar arasındaki köprü — Ara toplam
          (Σ lineSubtotal = po.subtotal) / KDV (po.vatTotal) / Genel toplam (po.grandTotal) — burada
          gösterilmezse kullanıcı 55.200 → 66.240 sıçramasını hâlâ ekrandan doğrulayamaz. */}
      <div className="mt-3 flex justify-end">
        <dl className="w-full max-w-[240px] space-y-1.5 text-[13px]">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Ara toplam</dt>
            <dd><MoneyCell value={po.subtotal} /></dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">KDV</dt>
            <dd><MoneyCell value={po.vatTotal} /></dd>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
            <dt className="text-[13px] font-medium">Genel toplam</dt>
            <dd><MoneyCell value={po.grandTotal} className="text-[15px] font-semibold tabular-nums" /></dd>
          </div>
        </dl>
      </div>

      {receipts.length || invoices.length ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {receipts.length ? (
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-2 text-[13px] font-semibold">Mal kabuller</h3>
              <ul className="space-y-1.5 text-[13px]">
                {receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/depo/mal-kabul/${r.id}`} className="font-mono hover:underline">{r.docNo}</Link>
                    <StatusBadge status={r.status} kind="receipt" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {invoices.length ? (
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-2 text-[13px] font-semibold">Alış faturaları</h3>
              <ul className="space-y-1.5 text-[13px]">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span className="font-mono">{i.docNo}</span>
                    <MoneyCell value={i.grandTotal} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

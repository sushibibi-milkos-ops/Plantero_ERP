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
          // Tur 5 P1 tedarik-po-detay-11 kök neden: bu blok mobilde de `items-end` (sağa yaslı)
          // kalıyordu — 390px'te belgenin en önemli sayısı ekranın sağ ucundaki dar bir şeritte,
          // sayfanın geri kalanından (sola hizalı başlık/tedarikçi) kopuk asılı duruyordu. Mobilde
          // (varsayılan, `sm:` öncesi) artık sayfa gövdesiyle AYNI sol kolonda; `sm:` (yan yana eylem
          // şeridi) üstünde eskisi gibi sağa yaslı kalır.
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <div className="text-left sm:text-right">
              {/* Tur 2 P1 tedarik-po-detay-03: 'Toplam' KDV dahil (grand_total) — etiket artık bunu
                  açıkça söylüyor, altındaki Ara toplam/KDV bloğu (page.tsx) tabanı doğrulanabilir kılar. */}
              <div className="text-[11px] font-medium text-muted-foreground">Toplam (KDV dahil)</div>
              <MoneyCell value={po.grandTotal} className="text-xl font-semibold tabular-nums" />
            </div>
            <OrderActions orderId={po.id} status={po.status} canApprove={userCan(user, 'purchasing.approve')} canSend={userCan(user, 'purchasing.send')} />
          </div>
        }
      >
        {/* Tur 4 P1 tedarik-po-detay-05 kök neden (kısmi): bu satır `text-sm` (14px) taşıyordu —
         * sayfanın geri kalanı (gövde 13px) ile aynı rolde ikinci bir boyut açıyordu, görünür ayrı
         * font boyutu sayısını 8'e çıkarıyordu (hedef <=6). Gövde kademesine (13px) indirildi. */}
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
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
        // Tur 6 P1 tedarik-po-detay-13 kök neden (düzeltilmiş teşhis): ölçülen 4px yatay taşma
        // `order-lines-table.tsx`den DEĞİL — paylaşılan `DocumentChain`in kendi kaydırma
        // kapsayıcısındaki kasıtlı kenar sızıntısından (`-mx-1`/`px-1`, dokunma kaydırma ipucu için)
        // geliyor: bu belgede yalnızca 3 düğüm var, 1152px'e sığıyor, kaydırma hiç gerekmiyor ama
        // sızıntı KOŞULSUZ uygulanıyor. Paylaşılan dosya değiştirilemez (kural 2) — `overflow-hidden`
        // yalnızca bu sayfaya özel sarmalayıcıda (kendi dosyamız), kaydırma davranışını (`overflow-x-
        // auto` İÇERİDE kalır) ETKİLEMEDEN sızıntının kap dışına taşmasını keser.
        <div className="mb-6 overflow-hidden">
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
            {/* Tur 4 P1 / Tur 5 P1 tedarik-po-detay-05 kök neden: bu satırın DEĞERİ (`font-semibold`,
             * 13/600) sayfa başlığındaki 20/600 (satır 44) ile AYNI sayıyı ('₺113.040,00') üçüncü/
             * dördüncü bir vurguda tekrar ediyordu — okuyucu hangi toplamın otorite olduğunu
             * tipografiden çıkaramıyordu. Belgenin TEK büyütülmüş toplamı sayfa başlığında kalır
             * (Stripe faturasındaki gibi); bu değer artık gövde kademesine (13/400, kalın DEĞİL) iner
             * — "son satır" vurgusu yalnızca üstteki `border-t` ayracından ve <dt>'nin kendi
             * `font-medium` etiketinden gelir, DEĞER kendi boyut/ağırlık kademesi AÇMAZ. */}
            <dd><MoneyCell value={po.grandTotal} /></dd>
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
                    {/* Tur 4 P2 tedarik-po-detay-06: 390px'te bu bağlantı (mal kabul detayına giden
                     * TEK yol) 109x19,5px'ti — 44px dokunma hedefinin altında. `max-sm:min-h-11` +
                     * dengeleyici negatif dikey kenar boşluğu (replenishment-panel.tsx'teki
                     * checkbox kalıbıyla aynı teknik) çevredeki satır aralığını büyütmeden hedefi
                     * büyütür. */}
                    <Link href={`/depo/mal-kabul/${r.id}`} className="inline-flex items-center font-mono hover:underline max-sm:min-h-11 max-sm:-my-3">{r.docNo}</Link>
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

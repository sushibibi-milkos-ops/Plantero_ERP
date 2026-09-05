'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Megaphone, ShieldAlert, Mail, Phone, MessageCircle, Ban, CheckCircle2, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { DocumentChain } from '@/components/document-chain';
import { EmptyState } from '@/components/empty-state';
import { formatQty } from '@/lib/format';
import { initiateRecallAction, recordRecallActionAction, closeRecallAction } from '../actions';
import type { RecallCustomer } from '../queries';
import type { getChain } from '@plantero/core';

type Item = { item: { id: string; lotId: string; hop: string; depth: number; deliveryId: string | null; qtyInStock: string; qtyDelivered: string; action: string | null; actionStatus: string }; lotNo: string; productName: string };
type Recall = { id: string; docNo: string; status: string; reason: string; direction: string; impact: unknown; rootLotId: string };

const HOP_LABELS: Record<string, string> = { raw_material: 'Hammadde', packaging: 'Ambalaj', semi_finished: 'Yarı mamul', finished: 'Mamul', merchandise: 'Ticari mal', delivered: 'Sevk edildi', unknown: 'Bilinmiyor' };
const ACTION_LABELS: Record<string, string> = { block: 'Bloklandı', notify_customer: 'Müşteri bilgilendirilecek', notify: 'Bilgilendirildi', return: 'İade alındı', destroy: 'İmha edildi' };

type QtyByUom = { uom: string; qty: string };

function readImpact(impact: unknown) {
  const i = (impact ?? {}) as {
    counts?: { lots?: number; workOrders?: number; deliveries?: number; customers?: number };
    qtyInStock?: string; qtyDelivered?: string;
    qtyInStockByUom?: QtyByUom[]; qtyDeliveredByUom?: QtyByUom[];
  };
  // Tur 2 P1 kalite-geri-cagirma-id-06 kök neden: `qtyInStock`/`qtyDelivered` farklı ölçü
  // birimlerindeki (ADET/KG) lotları tek çıplak sayıya topluyordu — birim yazılmadığından yanlışlığı
  // da görünmüyordu. `packages/core/src/lots/trace.ts` artık birim bazında kırılım
  // (`qtyInStockByUom`/`qtyDeliveredByUom`) üretiyor; eski (bu düzeltmeden önce) kaydedilmiş bir
  // `recalls.impact` satırında bu alanlar yoksa, birim BİLİNMEDİĞİ için (geriye dönük veri) boş
  // birimli tek kaleme düşülür — yeni simülasyonlarda bu dal hiç tetiklenmez.
  const fallback = (total: string | undefined): QtyByUom[] => (total && total !== '0' ? [{ uom: '', qty: total }] : []);
  return {
    lots: i.counts?.lots ?? 0, workOrders: i.counts?.workOrders ?? 0, deliveries: i.counts?.deliveries ?? 0, customers: i.counts?.customers ?? 0,
    qtyInStockByUom: i.qtyInStockByUom?.length ? i.qtyInStockByUom : fallback(i.qtyInStock),
    qtyDeliveredByUom: i.qtyDeliveredByUom?.length ? i.qtyDeliveredByUom : fallback(i.qtyDelivered),
  };
}

/**
 * Karışık birimde TEK bir KpiCard (`NumberFlow`, tek sayı) YETERSİZ — Tur 2 P1 kök nedeni buydu.
 * Tek birim varsa normal `KpiCard` (suffix=birim); birden fazla birim varsa `KpiCard variant="strip"`
 * ile BİT BİT AYNI sınıflarla yerel bir hücre (birim bazında " · " ile ayrılmış metin) basılır —
 * paylaşılan bileşen değiştirilmez, yalnızca bu modüle özgü görüntüleme kuralı eklenir.
 */
function QtyByUomStripCell({ title, list }: { title: string; list: QtyByUom[] }) {
  if (list.length <= 1) {
    const item = list[0];
    return <KpiCard title={title} value={item ? Number(item.qty) : null} format="qty" suffix={item?.uom || undefined} variant="strip" />;
  }
  const text = list.map((x) => formatQty(x.qty, x.uom || undefined)).join(' · ');
  return (
    <div className="h-[72px] w-[152px] shrink-0 snap-start rounded-lg border border-border/70 bg-card px-3 py-2 md:h-20 md:w-auto md:flex-1 md:shrink md:snap-align-none md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:border-border/60 md:first:border-l-0 md:bg-transparent md:px-4 md:py-3">
      <div className="truncate text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 truncate text-[19px] leading-none font-semibold tracking-tight tabular-nums">{text}</div>
      <div className="mt-1 h-[15px]" aria-hidden />
    </div>
  );
}

export function RecallDetail({
  recall, items, customers, chain, draftMessage,
}: {
  recall: Recall;
  items: Item[];
  customers: RecallCustomer[];
  chain: Awaited<ReturnType<typeof getChain>> | null;
  draftMessage: string | null;
}) {
  const router = useRouter();
  const impact = readImpact(recall.impact);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  async function initiate() {
    const res = await initiateRecallAction({ id: recall.id });
    if (res.ok) { toast.success(`Geri çağırma başlatıldı — ${res.data.blockedLots} lot bloklandı, ${res.data.notifiedCustomers} müşteri bilgilendirildi`); router.refresh(); }
    else toast.error(res.error);
  }

  async function recordAction(itemId: string, action: 'block' | 'notify' | 'return' | 'destroy') {
    setActionBusyId(itemId);
    const res = await recordRecallActionAction({ itemId, action });
    setActionBusyId(null);
    if (res.ok) { toast.success('Aksiyon kaydedildi'); router.refresh(); }
    else toast.error(res.error);
  }

  async function close() {
    const res = await closeRecallAction({ id: recall.id });
    if (res.ok) { toast.success('Geri çağırma kapatıldı'); router.refresh(); }
    else toast.error(res.error);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={recall.status} kind="recall" size="md" />
          <span className="text-sm text-muted-foreground">{recall.reason}</span>
        </div>
        <div className="flex items-center gap-2">
          {recall.status === 'simulation' ? (
            <ConfirmDialog
              trigger={<Button><Megaphone className="size-4" /> Geri Çağırmayı Başlat</Button>}
              title="Geri çağırma başlatılsın mı?"
              description="Zincirdeki tüm lotlar bloklanır ve etkilenen müşterilere bildirim gönderilir. Bu işlem geri alınamaz."
              destructive
              confirmLabel="Başlat"
              onConfirm={initiate}
            />
          ) : null}
          {recall.status === 'open' || recall.status === 'in_progress' ? (
            <ConfirmDialog trigger={<Button variant="outline"><CheckCircle2 className="size-4" /> Kapat</Button>} title="Geri çağırma kapatılsın mı?" description="Aksiyon takibi tamamlandıysa kaydı kapatın." confirmLabel="Kapat" onConfirm={close} />
          ) : null}
        </div>
      </div>

      {/* Tur 1 P1 kalite-kpi-strip-01/kalite-geri-cagirma-id-01/-02: iki ayrı `grid-cols-4` bloğu 6
          kartı 4+2'ye bölüp ikinci sırada 570px boş bırakıyordu, üstüne kartların yarısı ikonlu yarısı
          ikonsuzdu. Tek KpiStripRow şeridi hem boşluğu hem ikon tutarsızlığını kökten kapatır (strip
          varyantı zaten ikon almaz — kpi-card.tsx). */}
      <KpiStripRow>
        <KpiCard title="Etkilenen lot" value={impact.lots} format="int" variant="strip" />
        <KpiCard title="İş emri" value={impact.workOrders} format="int" variant="strip" />
        <KpiCard title="Sevkiyat" value={impact.deliveries} format="int" variant="strip" />
        <KpiCard title="Müşteri" value={impact.customers} format="int" variant="strip" />
        <QtyByUomStripCell title="Stoktaki miktar" list={impact.qtyInStockByUom} />
        <QtyByUomStripCell title="Sevk edilen miktar" list={impact.qtyDeliveredByUom} />
      </KpiStripRow>

      {chain && (chain.upstream.length || chain.downstream.length) ? (
        <div className="rounded-xl border border-border/60 p-4">
          <div className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Belge zinciri</div>
          <DocumentChain
            upstream={chain.upstream.map((n) => ({ type: n.type, id: n.id, docNo: n.docNo, status: n.status, date: n.date, amount: n.amount, partnerName: n.partnerName }))}
            current={{ type: 'recall', id: recall.id, docNo: recall.docNo, status: recall.status, date: null, amount: null, partnerName: null }}
            downstream={chain.downstream.map((n) => ({ type: n.type, id: n.id, docNo: n.docNo, status: n.status, date: n.date, amount: n.amount, partnerName: n.partnerName }))}
          />
        </div>
      ) : null}

      {/* Tur 2 P1 kalite-geri-cagirma-id-05: "Etkilenen müşteriler" ve "Bildirim taslağı" aynı grid
          satırında olduğundan `items-stretch` (varsayılan) uzun kartın (taslak metni) yüksekliğini
          KISA karta da uyguluyordu — 403px kutunun 257px'i tamamen boş kalıyordu. Stripe/Linear
          kartları kendi içeriğine sarılır, komşusuna değil: `items-start` her kartı kendi doğal
          yüksekliğinde bırakır. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <ShieldAlert className="size-3.5" /> Etkilenen müşteriler
          </div>
          {customers.length ? (
            // Tur 1 P1 kalite-geri-cagirma-id-03: her müşteri kendi çerçeveli kutusundaydı ve bu
            // kutular zaten çerçeveli bir kartın içindeydi ("kutu içinde kutu" — anti-ERP kokusu).
            // Tek kapta hairline ayraçlı satırlara indirildi (iç `border`/`rounded-lg` kaldırıldı).
            <ul className="-my-1 divide-y divide-border/60">
              {customers.map((c) => (
                <li key={c.id} className="py-2.5 text-sm first:pt-1 last:pb-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {c.email ? <span className="flex items-center gap-1"><Mail className="size-3" /> {c.email}</span> : null}
                    {c.phone ? <span className="flex items-center gap-1"><Phone className="size-3" /> {c.phone}</span> : null}
                    {c.whatsapp ? <span className="flex items-center gap-1"><MessageCircle className="size-3" /> {c.whatsapp}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sevkiyat zincirinde etkilenen müşteri bulunamadı.</p>
          )}
        </div>

        <div className="rounded-xl border border-border/60 p-4">
          <div className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bildirim taslağı</div>
          {draftMessage ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-[13px] leading-relaxed">{draftMessage}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">Simülasyon aşamasında oluşturulur.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 p-4">
        <div className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Aksiyon takibi</div>
        {items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3">Lot</th>
                  <th className="py-2 pr-3">Konum</th>
                  <th className="py-2 pr-3 text-right">Stokta</th>
                  <th className="py-2 pr-3 text-right">Sevk</th>
                  <th className="py-2 pr-3">Aksiyon</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {items.map(({ item, lotNo, productName }) => (
                  <tr key={item.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3"><LotBadge lotNo={lotNo} id={item.lotId} /><span className="ml-1.5 text-xs text-muted-foreground">{productName}</span></td>
                    <td className="py-2 pr-3 text-[13px] text-muted-foreground">{HOP_LABELS[item.hop] ?? item.hop}</td>
                    <td className="py-2 pr-3 text-right"><span className="num">{formatQty(item.qtyInStock)}</span></td>
                    <td className="py-2 pr-3 text-right"><span className="num">{formatQty(item.qtyDelivered)}</span></td>
                    <td className="py-2 pr-3 text-[13px]">
                      {item.actionStatus === 'done' ? <span className="text-success">{ACTION_LABELS[item.action ?? ''] ?? item.action}</span> : <span className="text-muted-foreground">Bekliyor</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {item.actionStatus !== 'done' && (recall.status === 'open' || recall.status === 'in_progress') ? (
                        <div className="flex justify-end gap-1">
                          <Button size="xs" variant="outline" disabled={actionBusyId === item.id} onClick={() => recordAction(item.id, 'notify')}><MessageCircle className="size-3" /> Bildir</Button>
                          <Button size="xs" variant="outline" disabled={actionBusyId === item.id} onClick={() => recordAction(item.id, 'return')}><Ban className="size-3" /> İade</Button>
                          <Button size="xs" variant="outline" className="text-destructive" disabled={actionBusyId === item.id} onClick={() => recordAction(item.id, 'destroy')}><PackageX className="size-3" /> İmha</Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="Henüz aksiyon kaydı yok" description="Geri çağırma başlatıldığında lotlar burada listelenir." />
        )}
      </div>
    </div>
  );
}

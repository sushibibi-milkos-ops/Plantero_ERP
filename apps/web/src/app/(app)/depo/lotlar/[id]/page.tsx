import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission, userCan } from '@/lib/auth';
import { getLotDetail, listLocations } from '@/modules/stock/queries';
import { LotActions } from '@/modules/stock/components/lot-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { TraceGraph } from '@/components/trace-graph';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LotQuantsTable } from '@/modules/stock/components/lot-quants-table';
import { LotMovesTable } from '@/modules/stock/components/lot-moves-table';
import { formatDate, formatQty } from '@/lib/format';
import { D } from '@plantero/core';

export const metadata: Metadata = { title: 'Lot Detayı' };
export const dynamic = 'force-dynamic';

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('stock.view');
  const detail = await getLotDetail(id);
  if (!detail) notFound();
  const { lot, product, quants, moves, qc, forward, backward, supplier, originReceipt, originWorkOrder } = detail;

  const onHandQty = quants.reduce((a, q) => a.plus(D(q.qty)), D(0));
  const initialQty = D(lot.initialQty);
  const consumedRatio = initialQty.gt(0) ? onHandQty.div(initialQty).mul(100) : null;

  const quarantineQuants = quants.filter((q) => q.usage === 'quarantine' && D(q.qty).gt(0));
  const quarantineQty = quarantineQuants.reduce((a, q) => a.plus(D(q.qty)), D(0)).toFixed(4);
  const canRelease = userCan(user, 'quality.release') && lot.status === 'quarantine' && quarantineQuants.length > 0;

  const [allLocations] = await Promise.all([listLocations()]);
  const internalOptions = allLocations.filter((l) => l.usage === 'internal' && l.isPickable).map((l) => ({ value: l.id, label: l.code }));
  const rejectedOptions = allLocations.filter((l) => l.usage === 'rejected').map((l) => ({ value: l.id, label: l.code }));

  return (
    <>
      {/* Önceki sürüm 5 satıra yayılıyordu (eyebrow "LOT" / lot no / ürün·sku / rozet satırı / maliyet
          satırı, ~76px+ başlık yüksekliği). Eyebrow kaldırıldı (breadcrumb'ta zaten var); lot no + tüm
          rozetler (durum, köken, SKT) tek satıra alındı; ürün·sku açıklama satırında kaldı — başlık
          bloğu 2 satıra indi. Maliyet/ilk giriş/tedarikçi lotu artık aşağıdaki tanım listesinde. */}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{lot.lotNo}</span>
            <StatusBadge status={lot.status} kind="lot" size="md" />
            <StatusBadge status={lot.origin} kind="lot_origin" size="md" />
            {lot.expiryDate ? <ExpiryBadge date={lot.expiryDate} /> : null}
          </span>
        }
        description={product ? `${product.p.name} · ${product.p.sku}` : undefined}
        actions={
          <div className="flex flex-col items-end gap-1.5">
            {/* Etiket yazdır / Taşı her lot durumunda mevcut; Serbest bırak / Reddet yalnızca
                karantinadaki lotlarda ve quality.release izniyle (docs/modules/depo.md §2) */}
            <LotActions lotId={lot.id} quarantineQty={quarantineQty} internalLocations={internalOptions} rejectedLocations={rejectedOptions} canRelease={canRelease} />
            {!canRelease && lot.status === 'quarantine' ? (
              <span className="text-xs text-muted-foreground">Serbest bırakma/red için kalite yetkisi gerekir</span>
            ) : null}
          </div>
        }
      />

      {/* Önceki sürüm başlık altında yalnızca tek satırlık maliyet/ilk giriş özetiyle 900px viewport'un
          ~%85'i beyaz kalıyordu — SKT, üretim tarihi, tedarikçi, giriş belgesi ve kalan/ilk giriş oranı
          hiç gösterilmiyordu (Tur 3 P1 bulgusu). Kompakt sütunlu tanım listesi bu boşluğu gerçek
          bilgiyle doldurur; alanlar yoksa (ör. üretim kaynaklı lotta tedarikçi) "—" ile aynı ızgara korunur. */}
      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/60 py-4 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">SKT</dt>
          <dd className="mt-0.5 text-[13px]">{lot.expiryDate ? formatDate(lot.expiryDate) : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Üretim tarihi</dt>
          <dd className="mt-0.5 text-[13px]">{lot.productionDate ? formatDate(lot.productionDate) : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Tedarikçi</dt>
          <dd className="mt-0.5 truncate text-[13px]">{supplier?.name ?? (lot.origin === 'production' ? 'Üretim (dahili)' : '—')}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Giriş belgesi</dt>
          <dd className="mt-0.5 text-[13px]">
            {originReceipt ? (
              // Kök neden (Tur 14 P1 depo-lotlar-id-04): çıplak metin bağlantısı satır yüksekliğine
              // sıkışıyordu (~17px) — 44px dokunma eşiğinin altında ve lottan kaynak belgeye gitmenin
              // mobildeki tek yolu. detail-field-groups-grid.tsx'teki dokunma-yastığı kalıbı (Tur 10
              // shell-empty-fields-toggle-01) burada dikey yastıkla uygulandı: -my-3 + min-h-11 masaüstü
              // görünümü değiştirmeden (md:my-0 md:min-h-0) mobilde dokunma alanını büyütür.
              <Link
                href={`/depo/mal-kabul/${originReceipt.id}`}
                className="code -my-3 inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline md:my-0 md:min-h-0"
              >
                {originReceipt.docNo}
              </Link>
            ) : originWorkOrder ? (
              <Link
                href={`/uretim/is-emirleri/${originWorkOrder.id}`}
                className="code -my-3 inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline md:my-0 md:min-h-0"
              >
                {originWorkOrder.docNo}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Kalan / İlk giriş</dt>
          <dd className="mt-0.5 text-[13px] tabular-nums">
            {formatQty(onHandQty.toFixed(4), product?.uomCode)} / {formatQty(lot.initialQty, product?.uomCode)}
            {consumedRatio ? (
              // %100'ü aşan bir oran (kalan > ilk giriş) bir veri tutarsızlığı sinyalidir (transfer/
              // düzeltme fazlası vb.) — önceden nötr/soluk metinle basılıyor, hiçbir görsel uyarı
              // taşımıyordu (Tur 4 P2 bulgusu). 0-100 arası nötr kalır, dışındaki her değer amber.
              (() => {
                const pct = consumedRatio.toDecimalPlaces(0);
                const anomalous = pct.gt(100) || pct.lt(0);
                // Kök neden (Tur 5 P2): tek bir olgu (tutarsızlık) için üç ayrı işaret üst üste
                // biniyordu — uyarı ikonu + turuncu renk + yüzde. Tek sinyal yeterli: rengin kendisi
                // (text-warning); ikon kaldırıldı, açıklama `title` tooltip'inde kalır.
                return anomalous ? (
                  <span className="ml-1 text-warning" title="Kalan miktar ilk girişten fazla — transfer/düzeltme hareketlerini kontrol edin">
                    (%{pct.toString()})
                  </span>
                ) : (
                  <span className="text-muted-foreground"> (%{pct.toString()})</span>
                );
              })()
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Maliyet</dt>
          <dd className="mt-0.5 text-[13px]"><MoneyCell value={lot.unitCost} className="inline" /></dd>
        </div>
        {lot.supplierLotNo ? (
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Tedarikçi lotu</dt>
            <dd className="mt-0.5 code text-[13px]">{lot.supplierLotNo}</dd>
          </div>
        ) : null}
        {(lot.status === 'quarantine' || lot.status === 'rejected') && lot.rejectReason ? (
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {lot.status === 'rejected' ? 'Red gerekçesi' : 'Karantina gerekçesi'}
            </dt>
            <dd className="mt-0.5 text-[13px]">{lot.rejectReason}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Oluşturulma</dt>
          <dd className="mt-0.5 text-[13px] text-muted-foreground">{formatDate(lot.createdAt)}</dd>
        </div>
      </dl>

      {/* Kök neden (Tur 5 P2): varsayılan sekme "Eldeki stok" genellikle TEK satır (o anki quant) —
          içerik 590px'te bitip altında ~660px öksüz boşluk kalıyordu. "Hareketler" bir lotun tüm
          yaşam döngüsünü (kabul/üretim/tüketim/sevkiyat) listelediğinden neredeyse hiçbir zaman tek
          satır değildir — varsayılan olarak dolu sekmeyle açılır. */}
      <Tabs defaultValue="moves" className="gap-4">
        {/* 4'lü sekme şeridi 390px'e sığmıyordu — "İzlenebilirlik" sağ kenardan kesiliyor, yatay
            kaydırılabildiğine dair hiçbir gösterge yoktu (Tur 4 P1 bulgusu). `variant="line"` (Stripe
            tarzı altı çizgili sekme, ör. iş emri detayında da kullanılıyor) segment pilinden ~50px daha
            az yer kaplar; kalan taşma için `overflow-x-auto` + sağ kenarda soldurma (mask) eklendi. */}
        <TabsList variant="line" className="w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-20px),transparent)]">
          <TabsTrigger value="quants" className="shrink-0 px-3 text-[13px]">Eldeki stok</TabsTrigger>
          <TabsTrigger value="moves" className="shrink-0 px-3 text-[13px]">Hareketler</TabsTrigger>
          <TabsTrigger value="quality" className="shrink-0 px-3 text-[13px]">Kalite kontrol</TabsTrigger>
          <TabsTrigger value="trace" className="shrink-0 px-3 text-[13px]">İzlenebilirlik</TabsTrigger>
        </TabsList>

        <TabsContent value="quants">
          <LotQuantsTable quants={quants} uomCode={product?.uomCode} />
        </TabsContent>

        <TabsContent value="moves">
          <LotMovesTable moves={moves} uomCode={product?.uomCode} />
        </TabsContent>

        <TabsContent value="quality">
          {qc.length === 0 ? (
            <EmptyState title="Kalite kontrol kaydı yok" description="Girişte kontrol zorunlu değilse bu bölüm boş kalır." />
          ) : (
            <div className="space-y-2">
              {qc.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-3 text-sm">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{c.docNo}</div>
                    <div>{c.kind === 'incoming' ? 'Girişte kontrol' : c.kind}</div>
                  </div>
                  <StatusBadge status={c.result} kind="qc" />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trace" className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Geriye izleme (kaynak)</h3>
            <div className="rounded-lg border border-border/70 bg-card p-3">
              <TraceGraph nodes={backward.nodes} edges={backward.edges} rootId={backward.rootId} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">İleriye izleme (gidiş)</h3>
            <div className="rounded-lg border border-border/70 bg-card p-3">
              <TraceGraph nodes={forward.nodes} edges={forward.edges} rootId={forward.rootId} />
            </div>
          </div>
          {/* Aynı dokunma-yastığı kalıbı (bkz. yukarıdaki Giriş belgesi bağlantısı) — sekme pasif
              olduğu için ölçüme girmiyor ama kök neden aynı: çıplak metin bağlantısı satır
              yüksekliğine sıkışıyordu. */}
          <Link
            href={`/kalite/izlenebilirlik?lot=${lot.id}`}
            className="-my-3 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-2 md:my-0 md:min-h-0"
          >
            Kalite modülünde detaylı izlenebilirlik / geri çağırma simülasyonu →
          </Link>
        </TabsContent>
      </Tabs>
    </>
  );
}

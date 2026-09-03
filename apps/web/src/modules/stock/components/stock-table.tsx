'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PRODUCT_TYPE_LABELS } from '../labels';
import type { StockRow } from '../queries';

/** `PRODUCT_TYPE_TONE`'daki tonların masaüstü nokta rengi — StatusBadge'in iç TONE_CLASSES'ı dışa
 *  açık olmadığından burada küçük bir yerel kopya (yalnızca bu tabloda kullanılan 5 ton). */
const TYPE_DOT: Record<string, string> = {
  finished: 'bg-primary', semi_finished: 'bg-info', raw_material: 'bg-foreground/50',
  packaging: 'bg-foreground/50', merchandise: 'bg-info', equipment: 'bg-warning',
  fixed_asset: 'bg-muted-foreground/60', service: 'bg-muted-foreground/60',
};

export function StockTable({ rows }: { rows: StockRow[] }) {
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [onlyCritical, setOnlyCritical] = useState(false);

  const data = useMemo(() => (onlyCritical ? rows.filter((r) => r.isCritical) : rows), [rows, onlyCritical]);
  // Depo neredeyse hep tek değer taşıyor (204/204 kayıt TIRE'de) — sütun genişliğinin büyük kısmı
  // hiç bilgi taşımadan gidiyor ve "Değer" sütununu yatay kaydırmaya itiyordu. Tek depo varsa sütun
  // hiç render edilmez; depo bilgisi sayfa başlığına taşınır (bkz. stok/page.tsx).
  const distinctWarehouses = useMemo(() => new Set(rows.map((r) => r.warehouseCode)), [rows]);
  const showWarehouseColumn = distinctWarehouses.size > 1;

  const columns = useMemo<ColumnDef<StockRow, unknown>[]>(
    () => {
      const cols: ColumnDef<StockRow, unknown>[] = [
        {
          accessorKey: 'name',
          header: 'Ürün',
          meta: { mobile: 'title' },
          cell: ({ row }) => (
            // min-w-0 + iç `truncate`: dış sarmalayıcı flex olduğundan (nokta rozetiyle paylaşılıyor)
            // `truncate` doğrudan bu span'a verilirse tarayıcı üç nokta basamıyordu — ürün adı sert
            // kırpılıyordu ("%100 Oat Chocolate Spredab…", Tur 4 P1 bulgusu). Ad kendi metin
            // düğümünde, ayrı bir `truncate` alır; nokta rozeti `shrink-0` ile sabit kalır.
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{row.original.name}</span>
              {row.original.isCritical ? <span className="size-1.5 shrink-0 rounded-full bg-destructive" title="Kritik stok (min. seviye altı)" /> : null}
            </span>
          ),
        },
        { accessorKey: 'sku', header: 'SKU', meta: { className: 'font-mono text-xs text-muted-foreground', mobile: 'subtitle' } },
        {
          id: 'type',
          accessorFn: (r) => r.type,
          header: 'Tip',
          meta: { width: 46, mobile: 'badge' },
          // Tur 10 P1 depo-stok-01 (dolaylı yan etki): önceki sürüm masaüstünde nokta, mobilde TAM
          // dolgulu rozet basıyordu ("mobilde kartta yer bol" gerekçesiyle) — StatusBadge varsayılanı
          // 11px'tir ve 50 satırın tamamında göründüğünden sayfanın 11px sayımını (kartın asıl
          // metriğinin 13px'ine karşı) tek başına ikiye katlıyordu; ayrıca artık kart bütçesi (shell,
          // Tur 10) çok daha dar — "yer bol" öncülü artık geçerli değil. Nokta + native tooltip artık
          // masaüstü/mobil FARKSIZ (bkz. TYPE_DOT / PRODUCT_TYPE_LABELS); tip zaten satıra dokununca
          // açılan Sheet'te ve arama/filtre çubuğunda erişilebilir kalır.
          cell: ({ getValue }) => {
            const t = getValue<string>();
            const label = PRODUCT_TYPE_LABELS[t] ?? t;
            return (
              <span className="inline-flex items-center justify-center" title={label}>
                <span aria-hidden className={cn('size-1.5 rounded-full', TYPE_DOT[t] ?? 'bg-muted-foreground/50')} />
                <span className="sr-only">{label}</span>
              </span>
            );
          },
        },
        // Kök neden düzeltmesi (Tur 10 P1 depo-stok-01): 4 sayısal sütunun tamamı `mobile:'meta'`
        // rolüyle basılıyordu — shell'in (Tur 10) yeniden tasarladığı mobil kart artık `meta` rolünü
        // satır 2'nin SOL tarafına (etiketsiz-değil-kısa-etiketli, 12px) yerleştiriyor, "dl" (dt/dd)
        // dalı artık YOK; kartın SAĞ ekseninde 13px tabular-nums'la yalnızca `mobile` rolü verilMEyen
        // (varsayılan/"rest") TEK sütun otomatik "metrik" seçilir (bkz. mobile-cards.tsx, aynı desen
        // products-table.tsx `listPrice`'ta kullanılıyor). Kullanıcının asıl karar vereceği sayı
        // "Kullanılabilir" (eldekinden rezerveyi düşen, gerçekten sevk/satılabilir miktar) — bu yüzden
        // `mobile` boş bırakılır ve tek metrik o olur (birim mobilde basılmaz — `QtyCell`'in ayrı
        // `text-[11px]` birim düğümü, 13px'lik metriğin kendisiyle aynı satırda 11px sayısını
        // gereksiz yere şişiriyordu; masaüstünde birim değişmeden kalır). "Eldeki"/"Rezerve"/"Değer"
        // mobil kartta artık gösterilmez — masaüstünde ve satıra dokunulduğunda açılan lot/lokasyon
        // dökümü Sheet'inde erişilebilir kalır (kart yükseklik bütçesi ≤72px, 56-72 hedef bandı).
        {
          accessorKey: 'qty',
          header: 'Eldeki',
          meta: { align: 'right', width: 110, mobile: 'hidden' },
          cell: ({ row }) => <QtyCell value={row.original.qty} uom={row.original.uomCode} />,
        },
        {
          accessorKey: 'reserved',
          header: 'Rezerve',
          meta: { align: 'right', width: 100, mobile: 'hidden' },
          cell: ({ row }) => <QtyCell value={row.original.reserved} uom={row.original.uomCode} />,
        },
        {
          // `mobile` KASITLI olarak boş: sütun tanımında sonuncu "rest" alan — shell bunu otomatik
          // olarak kartın tek "metric"i (satır 2 sağı, 13px tabular-nums) seçer.
          accessorKey: 'available',
          header: 'Kullanılabilir',
          meta: { align: 'right', width: 120 },
          cell: ({ row }) => (
            <>
              <span className="hidden md:inline-flex"><QtyCell value={row.original.available} uom={row.original.uomCode} /></span>
              <span className="md:hidden"><QtyCell value={row.original.available} /></span>
            </>
          ),
        },
        {
          accessorKey: 'value',
          header: 'Değer',
          meta: { align: 'right', width: 130, mobile: 'hidden' },
          cell: ({ row }) => <MoneyCell value={row.original.value} />,
        },
        {
          accessorKey: 'nearestExpiryDate',
          header: 'En yakın SKT',
          // Önceki 140px genişlik + scroll-fade gradyanı, süresi geçmiş lotlarda "N gün önce doldu ·
          // dd.MM.yyyy" metnini kırpıyordu — sayfadaki tek gerçekten aksiyon gerektiren satırın tarihi
          // okunamıyordu (Tur 3 P1 bulgusu). Tarih bilgisi masaüstünde bilinçli tutuldu (showDate
          // kaldırılmadı); sütun en uzun olası metne (geçmiş SKT) sığacak kadar genişletildi. Mobilde
          // (Tur 3 P1: SKT kartta hiç yoktu) sağ üstte kısa rozet olarak (`showDate={false}`) gösterilir.
          meta: { width: 228, mobile: 'badge' },
          cell: ({ row }) =>
            row.original.nearestExpiryDate ? (
              <>
                <span className="hidden md:inline-flex"><ExpiryBadge date={row.original.nearestExpiryDate} /></span>
                <span className="md:hidden"><ExpiryBadge date={row.original.nearestExpiryDate} showDate={false} /></span>
              </>
            ) : (
              <span className="hidden text-xs text-muted-foreground/60 md:inline">—</span>
            ),
        },
        {
          id: '__expand',
          header: () => <span className="sr-only">Detay</span>,
          enableSorting: false,
          meta: { width: 28, mobile: 'hidden' },
          cell: () => <ChevronRight className="size-3.5 text-muted-foreground/50" />,
        },
      ];
      if (showWarehouseColumn) {
        cols.splice(3, 0, { accessorKey: 'warehouseCode', header: 'Depo', meta: { width: 90, mobile: 'badge' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> });
      }
      return cols;
    },
    [showWarehouseColumn],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'type', title: 'Tip', options: Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
    ...(showWarehouseColumn ? [{ columnId: 'warehouseCode', title: 'Depo', options: Array.from(distinctWarehouses).map((v) => ({ value: v, label: v })) }] : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        getRowId={(r) => `${r.productId}:${r.warehouseId}`}
        searchPlaceholder="Ürün, SKU ara…"
        filters={filters}
        initialSorting={[{ id: 'name', desc: false }]}
        onRowClick={(r) => setSelected(r)}
        emptyTitle="Stok kaydı yok"
        emptyDescription="Mal kabul yapıldıkça burada listelenecek."
        toolbarExtra={
          // Kök neden düzeltmesi (Tur 10 P1 depo-stok-02): `h-8` (32px) sarmalayıcı + `scale-90`
          // dönüşümü Switch'in kökünü (ui/switch.tsx'in Tur 10'da eklediği mobilde 44×44'lük dokunma
          // hedefini) 39.6×39.6'ya küçültüyordu — `scale-90` transform, `getBoundingClientRect()`'in
          // gördüğü GERÇEK boyutu de küçültür. `scale-90` kaldırıldı (masaüstünde görünüm birebir aynı
          // kalır — track/thumb kökten ayrı bir `<span>`'de sabit boyutludur, kökün ölçeğine bağlı
          // değildir); label mobilde `h-11` (≥44px) olur, masaüstünde eski kompakt `h-8`'e döner.
          <label className="flex h-11 items-center gap-2 rounded-md border border-border/70 px-2.5 text-[13px] md:h-8">
            <Switch checked={onlyCritical} onCheckedChange={setOnlyCritical} />
            <span>Sadece kritik</span>
          </label>
        }
      />

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.sku} · {selected.warehouseName} — lot/lokasyon kırılımı
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 px-4 pb-4">
                {selected.breakdown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Kayıt yok</p>
                ) : (
                  selected.breakdown
                    .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'))
                    .map((b) => (
                      <div key={b.quantId} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-[13px]">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{b.locationCode}</span>
                            {b.usage === 'quarantine' ? <StatusBadge status="quarantine" kind="lot" size="sm" /> : null}
                          </div>
                          {b.lotNo ? <LotBadge lotNo={b.lotNo} status={b.lotStatus} id={b.lotId ?? undefined} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <QtyCell value={b.qty} uom={selected.uomCode} />
                          {b.expiryDate ? <ExpiryBadge date={b.expiryDate} showDate={false} /> : null}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

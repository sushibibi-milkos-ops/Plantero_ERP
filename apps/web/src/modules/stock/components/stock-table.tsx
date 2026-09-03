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
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPE_TONE } from '../labels';
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
          // İkon çorbası değil ama rozet metni de ~60px alıyordu; masaüstünde yalnızca renkli nokta +
          // native tooltip, mobilde (kartta yer bol) tam rozet — bkz. TYPE_DOT / PRODUCT_TYPE_LABELS.
          cell: ({ getValue }) => {
            const t = getValue<string>();
            const label = PRODUCT_TYPE_LABELS[t] ?? t;
            return (
              <>
                <span className="hidden items-center justify-center md:inline-flex" title={label}>
                  <span aria-hidden className={cn('size-1.5 rounded-full', TYPE_DOT[t] ?? 'bg-muted-foreground/50')} />
                  <span className="sr-only">{label}</span>
                </span>
                <span className="md:hidden">
                  <StatusBadge status={t} label={label} tone={PRODUCT_TYPE_TONE[t] ?? 'neutral'} />
                </span>
              </>
            );
          },
        },
        // Rezerve ve SKT mobilde `hidden` idi — depo personelinin mobilde en çok baktığı iki alan
        // masaüstünde bile görünmeden tabletlerde tamamen kayboluyordu (Tur 3 P1 bulgusu). Masaüstünde
        // değişiklik yok (sağa hizalı `QtyCell`/`MoneyCell`); mobilde `mobile:'meta'` rolüyle tek,
        // etiketsiz-değil-kısa-etiketli satırda toplanır ("Eldeki 180 KG · Rezerve 20 KG · …") — ayrı bir
        // `dl` satırı yerine kartın tek meta satırına eklenir, kart yüksekliği ~155px'ten ~90-100px'e iner.
        {
          accessorKey: 'qty',
          header: 'Eldeki',
          meta: { align: 'right', width: 110, mobile: 'meta' },
          cell: ({ row }) => (
            <>
              <span className="hidden md:inline-flex"><QtyCell value={row.original.qty} uom={row.original.uomCode} /></span>
              <span className="inline-flex items-baseline gap-1 md:hidden">
                <span className="text-muted-foreground/70">Eldeki</span>
                <QtyCell value={row.original.qty} uom={row.original.uomCode} />
              </span>
            </>
          ),
        },
        {
          accessorKey: 'reserved',
          header: 'Rezerve',
          meta: { align: 'right', width: 100, mobile: 'meta' },
          cell: ({ row }) => (
            <>
              <span className="hidden md:inline-flex"><QtyCell value={row.original.reserved} uom={row.original.uomCode} /></span>
              <span className="inline-flex items-baseline gap-1 md:hidden">
                <span className="text-muted-foreground/70">Rezerve</span>
                <QtyCell value={row.original.reserved} uom={row.original.uomCode} />
              </span>
            </>
          ),
        },
        {
          accessorKey: 'available',
          header: 'Kullanılabilir',
          meta: { align: 'right', width: 120, mobile: 'meta' },
          cell: ({ row }) => (
            <>
              <span className="hidden md:inline-flex"><QtyCell value={row.original.available} uom={row.original.uomCode} /></span>
              <span className="inline-flex items-baseline gap-1 md:hidden">
                <span className="text-muted-foreground/70">Kullan.</span>
                <QtyCell value={row.original.available} uom={row.original.uomCode} />
              </span>
            </>
          ),
        },
        {
          accessorKey: 'value',
          header: 'Değer',
          meta: { align: 'right', width: 130, mobile: 'meta' },
          cell: ({ row }) => (
            <>
              <span className="hidden md:inline-flex"><MoneyCell value={row.original.value} /></span>
              <span className="inline-flex items-baseline gap-1 md:hidden">
                <span className="text-muted-foreground/70">Değer</span>
                <MoneyCell value={row.original.value} />
              </span>
            </>
          ),
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
          <label className="flex h-8 items-center gap-2 rounded-md border border-border/70 px-2.5 text-[13px]">
            <Switch checked={onlyCritical} onCheckedChange={setOnlyCritical} className="scale-90" />
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

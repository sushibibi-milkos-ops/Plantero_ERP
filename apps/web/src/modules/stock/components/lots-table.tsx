'use client';

import { useMemo, useState } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { cn } from '@/lib/utils';
import { getStatusInfo, statusOptions } from '@/lib/status';
import type { LotRow } from '../queries';

// Depo lotlarının ezici çoğunluğu `released` (ör. 200'de 195) — Linear kuralı yalnızca istisnayı
// rozetler, normali değil. Bu ikisi kullanıldığı her yerde (durum sütunu + varsayılan sıralama)
// aynı liste (Tur 4 P1 bulgusu: "Serbest" rozeti 50/50 satırda tekrar edip göz için bilgi taşımayı
// bırakıyordu — sütun ~230px genişlikte hiç sinyal vermeden gidiyordu).
const EXCEPTION_LOT_STATUSES = new Set(['quarantine', 'rejected', 'recalled', 'expired']);

export function LotsTable({ lots }: { lots: LotRow[] }) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Başlıktaki "195 serbest · 3 karantinada · 2 red" özeti artık tıklanabilir çip — statik metin
  // hiçbir işlev taşımıyordu (Tur 4 P1 bulgusu suggestedFix).
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of lots) c.set(l.status, (c.get(l.status) ?? 0) + 1);
    return c;
  }, [lots]);
  const chipOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const s of ['quarantine', 'rejected', 'released', 'consumed', 'recalled', 'expired']) if (counts.has(s)) { order.push(s); seen.add(s); }
    for (const s of counts.keys()) if (!seen.has(s)) order.push(s);
    return order;
  }, [counts]);

  const data = useMemo(() => (statusFilter ? lots.filter((l) => l.status === statusFilter) : lots), [lots, statusFilter]);

  const columns = useMemo<ColumnDef<LotRow, unknown>[]>(
    () => [
      // Kök neden (Tur 5 P1): mobil kartta hiyerarşi tersti — lot no (teknik anahtar) başlık rolünü
      // üstleniyor, satırın asıl anlamı olan ürün adı SKU ile aynı soluk gri alt satıra düşüyordu.
      // Mobil ROLLERİ takas edildi (masaüstü sütun sırası DEĞİŞMEDİ — Lot no hâlâ ilk sütun): ürün
      // adı artık `title` (14px font-medium, tam kontrast), lot no `subtitle` (LotBadge zaten
      // kutusuz, salt font-mono text-xs — bkz. lot-badge.tsx).
      // Kök neden düzeltmesi (Tur 10 P1 depo-lotlar-01, kart yüksekliği): `id` verilince LotBadge
      // kendi içine AYRI bir `<Link>` (ve dokunma hedefi için `h-11` — 44px) sarıyordu — satır zaten
      // `rowHref` ile tıklanabilir/gezinilebilir olduğundan bu iç içe bağlantı tamamen gereksizdi,
      // tek etkisi kartın 2. satırını (subtitle) 44px'e zorlamaktı (kart 88-93px'e çıkıyordu, hedef
      // 56-72px). `id` kaldırıldı — LotBadge artık düz metin (lotNo + istisna durumunda nokta),
      // gezinme satırın kendi `rowHref`'inden gelir.
      { id: 'lotNo', accessorFn: (r) => r.lotNo, header: 'Lot no', meta: { mobile: 'subtitle' }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} status={row.original.status} /> },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'title' }, cell: ({ row }) => <span>{row.original.productName} <span className="font-mono text-xs text-muted-foreground">· {row.original.sku}</span></span> },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Durum',
        meta: { width: 96, mobile: 'badge' },
        // Tur 3'te "released" nötr/muted bir rozet aldı ama 50/50 satırda AYNI nötr rozet yine
        // tekrar ediyordu — sessiz de olsa bir rozet, göz için hâlâ "her satırda bir şey var"
        // gürültüsü taşıyordu (Tur 4 P1 bulgusu, hedef: rozetli satır oranı ≤%25). Linear yalnızca
        // istisnayı rozetler: karantina/red/geri çağrıldı/SKT geçti dışında hiçbir şey basılmaz.
        cell: ({ getValue }) => {
          const status = getValue<string>();
          if (!EXCEPTION_LOT_STATUSES.has(status)) return null;
          return <StatusBadge status={status} kind="lot" />;
        },
      },
      // Kök neden düzeltmesi (Tur 10 P1 depo-lotlar-01) — stock-table.tsx ile aynı gerekçe: shell'in
      // (Tur 10) yeniden tasarladığı mobil kartta artık ayrı bir "dl" (dt/dd) dalı yok; `mobile`
      // rolü verilMEyen (varsayılan/"rest") TEK sütun otomatik olarak kartın 13px tabular-nums
      // "metrik"i (satır 2 sağı) seçilir. Bir lot için en temel sayı Eldeki miktardır — `mobile` boş
      // bırakılır; mobilde birim basılmaz (`QtyCell`'in ayrı `text-[11px]` birim düğümü 13px'lik
      // metriğin kendisiyle aynı satırda 11px sayısını gereksiz yere şişiriyordu — masaüstünde
      // değişmeden kalır). Maliyet mobil kartta artık gösterilmez (masaüstünde/detay sayfasında
      // erişilebilir); Lokasyon kısa metin olduğundan meta ipucu olarak kalır (Durum zaten ayrı bir
      // rozet).
      {
        // `mobile` KASITLI olarak boş: sütun tanımında sonuncu "rest" alan — shell bunu otomatik
        // olarak kartın tek "metric"i (satır 2 sağı, 13px tabular-nums) seçer.
        accessorKey: 'onHandQty',
        header: 'Eldeki',
        meta: { align: 'right', width: 110 },
        cell: ({ row }) => (
          <>
            <span className="hidden md:inline-flex"><QtyCell value={row.original.onHandQty} uom={row.original.uomCode} /></span>
            <span className="md:hidden"><QtyCell value={row.original.onHandQty} /></span>
          </>
        ),
      },
      {
        accessorKey: 'unitCost',
        header: 'Maliyet',
        meta: { align: 'right', width: 110, mobile: 'hidden' },
        cell: ({ row }) => <MoneyCell value={row.original.unitCost} />,
      },
      {
        accessorKey: 'locationCount',
        header: 'Lokasyon',
        meta: { width: 150, mobile: 'meta' },
        // Önceki sürüm başlığı "Lokasyon" iken değeri lokasyon SAYISI ("1"/"2") gösteriyordu — kullanıcı
        // bunu raf kodu sanıyordu (kardeş ekran /depo/skt gerçek kodu gösterir, çelişki yaratıyordu).
        // Tek lokasyonlu lotlarda gerçek kod, çok lokasyonlularda "<kod> +N" gösterilir.
        cell: ({ row }) => {
          const { firstLocationCode, locationCount } = row.original;
          if (!firstLocationCode) return <span className="text-xs text-muted-foreground/60">—</span>;
          return (
            <span className="font-mono text-xs">
              {firstLocationCode}
              {locationCount > 1 ? <span className="text-muted-foreground"> +{locationCount - 1}</span> : null}
            </span>
          );
        },
      },
      {
        accessorKey: 'expiryDate',
        header: 'SKT',
        // stock-table.tsx'teki aynı kök nedenle (Tur 3 P1) — geçmiş SKT'li lotlarda "N gün önce doldu ·
        // dd.MM.yyyy" 150px'te kırpılıyordu; masaüstünde 228px'e genişletildi. Mobilde (SKT kartta hiç
        // yoktu) sağ üstte kısa rozet olarak (`showDate={false}`) gösterilir.
        meta: { width: 228, mobile: 'badge' },
        // Varsayılan sıralama artık önce istisnaları öne getirir (karantina/red/geri çağrıldı/SKT
        // geçti), sonra SKT'ye göre — 195 "serbest" satır arasında kaybolan 5 istisna en üstte
        // görünür (Tur 4 P1 bulgusu suggestedFix: "varsayılan sıralamayı istisnalar öne gelecek
        // şekilde kur"). Kullanıcı başlığa tıklayıp yine yalnızca SKT'ye göre sıralayabilir.
        sortingFn: (a, b) => {
          const pa = EXCEPTION_LOT_STATUSES.has(a.original.status) ? 0 : 1;
          const pb = EXCEPTION_LOT_STATUSES.has(b.original.status) ? 0 : 1;
          if (pa !== pb) return pa - pb;
          return (a.original.expiryDate ?? '').localeCompare(b.original.expiryDate ?? '');
        },
        cell: ({ row }) =>
          row.original.expiryDate ? (
            <>
              <span className="hidden md:inline-flex"><ExpiryBadge date={row.original.expiryDate} /></span>
              <span className="md:hidden"><ExpiryBadge date={row.original.expiryDate} showDate={false} /></span>
            </>
          ) : (
            <span className="hidden text-xs text-muted-foreground/60 md:inline">—</span>
          ),
      },
      { accessorKey: 'supplierName', header: 'Kaynak', meta: { mobile: 'hidden' }, cell: ({ row }) => <span className="truncate text-xs text-muted-foreground">{row.original.supplierName ?? (row.original.originWorkOrderId ? 'Üretim' : '—')}</span> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('lot') },
  ];

  return (
    <>
      {/* Başlıktaki statik "195 serbest · 3 karantinada · 2 red" metni tıklanabilir çipe çevrildi
          (Tur 4 P1 bulgusu suggestedFix) — aynı bilgi artık bir eylem de taşıyor. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {chipOrder.map((s) => {
          const info = getStatusInfo(s, 'lot');
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter((f) => (f === s ? null : s))}
              aria-pressed={active}
              className={cn(
                // h-11 md:h-7: 390px'te 28px dokunma hedefi eşiğin altındaydı (Tur 5 P1 bulgusu) —
                // masaüstünde yoğun çip şeridi (h-7) korunur.
                'inline-flex h-11 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors md:h-7',
                active ? 'border-primary/50 bg-primary/5 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-accent/40 hover:text-foreground',
              )}
            >
              <span aria-hidden className={cn('size-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/50')} />
              {info.label}
              <span className="tabular-nums text-muted-foreground">{counts.get(s)}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={data}
        getRowId={(l) => l.id}
        rowHref={(l) => `/depo/lotlar/${l.id}`}
        searchPlaceholder="Lot no, ürün ara…"
        filters={filters}
        initialSorting={[{ id: 'expiryDate', desc: false }]}
        initialColumnVisibility={{ supplierName: false }}
        emptyTitle={statusFilter ? 'Bu durumda lot yok' : 'Henüz lot yok'}
        emptyDescription={statusFilter ? undefined : 'Mal kabul veya üretim çıktısı ile lot oluşur.'}
      />
    </>
  );
}

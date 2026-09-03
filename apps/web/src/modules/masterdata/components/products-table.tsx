'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { SubtleStatusBadge } from './subtle-status-badge';
import type { ProductListRow } from '../queries';
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPE_TONE } from '../product-labels';

export function ProductsTable({ products }: { products: ProductListRow[] }) {
  // Tüm satırlarda maliyet sıfırsa (henüz maliyetlendirilmemiş katalog) sütun hiç render edilmez —
  // yalnızca genişlik tüketen, sıfır bilgi taşıyan bir sütun bırakmamak için (segments-table'daki
  // hasContext/hasReserved deseniyle aynı: veri yoksa sütun yok).
  const hasCost = useMemo(() => products.some((p) => Number(p.averageCost) !== 0), [products]);

  const columns = useMemo<ColumnDef<ProductListRow, unknown>[]>(() => {
    const cols: ColumnDef<ProductListRow, unknown>[] = [
      // Tur 9/10 P1 bulgusu: kart 4 katman taşıyordu (başlık, SKU alt başlığı, Ambalaj meta, ayrı bir
      // hairline+`dl` satırı — Eldeki Stok/Satış Fiyatı/[Birim Maliyet]) ve 118px'e çıkıyordu (hedef
      // ≤72). `dl` bloğu (shell, `mobile-cards.tsx`, Tur 10) tamamen kaldırıldı: kart artık en fazla 2
      // satır — satır 1 başlık+rozet, satır 2 alt başlık+meta ipuçları+TEK metrik. Eldeki Stok
      // `stock-table.tsx`'teki "Eldeki/Rezerve" ile AYNI teknikle (masaüstünde etiketsiz `QtyCell`,
      // mobilde kısa etiket + değer) satır 2'nin meta ipuçlarına eklendi; Satış Fiyatı `mobile` YOK
      // bırakıldı — sütun tanımında son "rest" alan olduğu için shell tarafından otomatik "metric"
      // (satır 2 sağı) seçilir.
      { accessorKey: 'sku', header: 'SKU', meta: { mobile: 'subtitle', className: 'font-mono text-[12px]', width: 92 } },
      {
        accessorKey: 'shortCode',
        header: 'Kısa Kod',
        // Nadiren bakılır, dar ekranda taşan sütun — masaüstünde varsayılan gizli, sütun seçiciden açılır.
        meta: { mobile: 'hidden', className: 'font-mono text-[12px] text-muted-foreground', width: 120, defaultHidden: true },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        accessorKey: 'name',
        header: 'Ürün Adı',
        meta: { mobile: 'title', className: 'font-medium max-w-[220px] truncate' },
        cell: ({ getValue }) => (
          <span className="block max-w-[220px] truncate" title={getValue<string>()}>
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'category',
        accessorFn: (r) => r.category2 ?? r.category1 ?? '',
        header: 'Kategori',
        meta: { mobile: 'hidden', width: 160 },
        cell: ({ row }) => {
          const r = row.original;
          // Yalnızca en alt seviye gösterilir; tam yol (kategori1 → 2 → 3) title'da durur.
          const leaf = r.category3 ?? r.category2 ?? r.category1;
          if (!leaf) return <span className="text-muted-foreground/50">—</span>;
          const fullPath = [r.category1, r.category2, r.category3].filter(Boolean).join(' → ');
          return (
            <span className="block truncate text-[12px] text-muted-foreground" title={fullPath}>
              {leaf}
            </span>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Tip',
        // Tek tip katalogda (100/100 'Mamul') sütun sıfır bilgi taşır — varsayılan gizli; tip bilgisi
        // zaten üstteki faceted filtreden erişilebilir. Mobil kartta da gizli.
        meta: { mobile: 'hidden', width: 110, defaultHidden: true },
        cell: ({ getValue }) => {
          const t = getValue<string>();
          return <StatusBadge status={t} label={PRODUCT_TYPE_LABELS[t] ?? t} tone={PRODUCT_TYPE_TONE[t] ?? 'neutral'} />;
        },
      },
      {
        accessorKey: 'packaging',
        header: 'Ambalaj',
        // Tur 4 P1: aynı ada sahip birden çok SKU (ör. "Badem İçeceği 1 Litrelik UHT" ×4) yalnızca
        // Ambalaj ile ayrışıyor — mobilde tamamen gizliyken 4 özdeş görünen kart oluşuyordu. SKU
        // alt başlığından sonra aynı meta satırında etiketsiz kalır ("12 Adet").
        meta: { mobile: 'meta', width: 100 },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        accessorKey: 'barcode',
        header: 'Barkod',
        meta: { mobile: 'hidden', className: 'font-mono text-[12px] text-muted-foreground', width: 130 },
        cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-muted-foreground/50">—</span>,
      },
      {
        accessorKey: 'status',
        header: 'Durum',
        // 92/100 aktif, 8/100 kullanım dışı — gerçek varyans taşıyor (BOM'daki sıfır-varyans sütunlarından
        // farklı), sütun kalır. Tur 4 P1: 45/50 satır dolgulu yeşil "Aktif" taşıyordu — sütun boyunca
        // kesintisiz yeşil şerit, renk hiçbir ayırt edici bilgi taşımıyordu. Olağan durum (Aktif) artık
        // dolgusuz (yalnız nokta + metin); dolgulu rozet yalnızca istisnalara (Kullanım dışı) kalır.
        meta: { mobile: 'badge', width: 90 },
        // Tur 9/10 P1 bulgusu (ana-veri-urunler-01): mobil kart 72.5px'e çıkıyordu (hedef ≤72) —
        // fark tek başına bu rozetten geliyordu (100/100'e yakını "Aktif" — dolgusuz olsa bile 6px'lik
        // nokta glifi satır 1'in yüksekliğini masaüstüyle aynı `<td>` bağlamında bile ölçülebilir
        // biçimde artırıyordu). Masaüstü DEĞİŞMEDİ (`hidden md:inline-flex` — her satırda aynı rozet).
        // Mobilde olağan durum ("Aktif") artık HİÇ basılmaz — zaten Tur 5 P1'den beri dolgusuz/nötr,
        // sessiz kalması gereken bir "sıfır bilgi" değeri (bkz. yukarıdaki yorum); yalnızca istisnai
        // durumlar (Taslak/Kullanım dışı) `md:hidden` ikinci düğümle mobil kartta görünür kalır.
        cell: ({ getValue }) => {
          const s = getValue<string>();
          // "Kullanım dışı" bir hata değil — paylaşılan sözlük (lib/status.ts) 'cancelled' için 'danger'
          // veriyor, burada nötr'e çevrilir (dosya ortak olduğu için değiştirilmedi, bkz. rapor).
          const exceptionBadge = <StatusBadge status={s} kind="product" tone={s === 'cancelled' ? 'muted' : undefined} />;
          const desktopNode = s === 'active' ? <SubtleStatusBadge tone="muted" label="Aktif" /> : exceptionBadge;
          return (
            <>
              <span className="hidden md:inline-flex">{desktopNode}</span>
              <span className="md:hidden">{s === 'active' ? null : exceptionBadge}</span>
            </>
          );
        },
      },
      {
        accessorKey: 'onHandQty',
        header: 'Eldeki Stok',
        // Tur 9/10 P1 bulgusu — bkz. üstteki `sku` yorumu: kart yüksekliği bütçesi (≤72px) dar; satır 2
        // zaten SKU (subtitle) + Ambalaj (meta) + Satış Fiyatı (metric) taşıyor — dördüncü bir alan
        // (72.5px'e çıkardı) kartı hedefin üzerine itti. Eldeki Stok'a bilinçli olarak `mobile` verilmez;
        // ürün detayına gidilince görünür kalır, masaüstü sütun değişmez.
        meta: { align: 'right', width: 130 },
        cell: ({ row }) => <QtyCell value={row.original.onHandQty} uom={row.original.uomCode} />,
      },
    ];
    if (hasCost) {
      cols.push({
        accessorKey: 'averageCost',
        header: 'Birim Maliyet',
        // Kart yüksekliği bütçesi dar (hedef ≤72px) — ikincil/opsiyonel bir maliyet alanı mobil karta
        // eklenmez (yalnızca `hasCost` true iken var olan bir sütun); masaüstünde/detay sayfasında
        // erişilebilir kalır.
        meta: { align: 'right', width: 120, mobile: 'hidden' },
        cell: ({ getValue }) => <MoneyCell value={getValue<string>()} muted />,
      });
    }
    cols.push({
      accessorKey: 'listPrice',
      header: 'Satış Fiyatı',
      // Tur 4 P1: 390px'te tamamen düşüyordu — ürünün satış fiyatı mobilde hiçbir yerde görünmüyordu.
      // Tur 9/10 P1 bulgusu: o turdaki çözüm (etiketsiz "rest" satırı) kartı 118px'e çıkarıyordu.
      // `mobile` kasıtlı olarak boş: sütun tanımında SONUNCU "rest" alan — shell (`mobile-cards.tsx`,
      // Tur 10) bunu otomatik olarak kartın tek "metric"i (satır 2 sağı) seçer.
      meta: { align: 'right', width: 120 },
      cell: ({ getValue }) => <MoneyCell value={getValue<string>()} muted={getValue<string>() === '0'} />,
    });
    return cols;
  }, [hasCost]);

  const filters: DataTableFilter[] = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category2).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, 'tr-TR'));
    return [
      {
        columnId: 'type',
        title: 'Tip',
        options: Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        columnId: 'status',
        title: 'Durum',
        options: [
          { value: 'active', label: 'Aktif', tone: 'success' },
          { value: 'draft', label: 'Taslak', tone: 'muted' },
          { value: 'cancelled', label: 'Kullanım dışı', tone: 'danger' },
        ],
      },
      { columnId: 'category', title: 'Kategori', options: cats.map((c) => ({ value: c, label: c })) },
    ];
  }, [products]);

  return (
    <DataTable
      columns={columns}
      data={products}
      getRowId={(p) => p.id}
      searchPlaceholder="Ad, SKU ya da barkod ara…"
      filters={filters}
      initialSorting={[{ id: 'sku', desc: false }]}
      rowHref={(p) => `/ana-veri/urunler/${p.id}`}
      virtualize={products.length > 300}
      emptyTitle="Henüz ürün yok"
      emptyDescription="Excel'den içe aktarın ya da yeni bir ürün oluşturun."
    />
  );
}

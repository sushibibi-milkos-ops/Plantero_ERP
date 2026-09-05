'use client';

import { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { formatQty, formatDateTime } from '@/lib/format';
// Alt-yol içe aktarımı ('@plantero/core/money', barrel değil): kök giriş noktası node:crypto kullanan
// sunucu-yalnızca auth/session.ts'i de dışa aktarıyor — 'use client' bileşeninde barrel'dan import
// tarayıcı paketini kırar (bkz. counts-table.tsx aynı düzeltme).
import { D } from '@plantero/core/money';
import { cn } from '@/lib/utils';
import type { CriticalStockRow } from '../queries';

const RISK_LABEL: Record<CriticalStockRow['risk'], string> = { critical: 'Kritik', warning: 'Uyarı', none: 'Normal' };
const RISK_CLASS: Record<CriticalStockRow['risk'], string> = {
  critical: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning',
  none: 'bg-muted/60 text-muted-foreground',
};

export function CriticalStockTable({
  rows, onlyCritical, canManageRule, onEditRule, onClearFilter,
}: {
  rows: CriticalStockRow[]; onlyCritical: boolean; canManageRule?: boolean; onEditRule?: (row: CriticalStockRow) => void;
  /** "Sadece kritik/uyarı" filtresini kapatır — filtre kaynaklı boş durumun eylemi (Tur 1 P0 tedarik-kritik-stok-02). */
  onClearFilter?: () => void;
}) {
  const filtered = useMemo(() => (onlyCritical ? rows.filter((r) => r.risk !== 'none') : rows), [rows, onlyCritical]);
  // Tur 1 P0 tedarik-kritik-stok-02 kök neden: `onlyCritical` panelde tutulan, DataTable'ın
  // KENDİ arama/sütun-filtre state'inin dışında bir ön-filtre — DataTable'ın "filtreli boş" dalı
  // (SearchX ikonu, "Eşleşen kayıt yok") bunu hiç bilmediği için tetiklenmiyor, `rows.length===0`
  // gerçek-boş dalı devreye girip 36 kural varken yanlış "Kural tanımlı ürün bulunamadı" metnini
  // basıyordu. DataTable ortak bileşen olduğu için (kural 2) buradan değiştirilemez — ama zaten
  // TAM bunun için tasarlanmış `emptyTitle`/`emptyDescription`/`emptyAction` prop'ları var; bu
  // filtrenin ürettiği boşluğu DataTable'a onun kendi "veri hiç yok" boş durumu ÜZERİNDEN,
  // içeriği bu duruma göre hesaplayarak bildiriyoruz — arama kutusu/diğer filtreler bu sırada da
  // çalışır durumda kalır (DataTable'ı tamamen atlayıp toolbar'ı kaybetmek yerine).
  const filterEmptied = onlyCritical && filtered.length === 0 && rows.length > 0;

  const columns = useMemo<ColumnDef<CriticalStockRow, unknown>[]>(
    () => [
      // width + iç inline-block (tur 2 P0 tedarik-kritik-stok-04 kök nedeni — bkz. aşağıda
      // `preferredSupplierName` notu, aynı teknik): td'ye verilen `width` tek başına bir İPUCUdur,
      // içerik (`white-space:nowrap`) onu aşınca göz ardı edilir. Hücrenin TEK çocuğu olarak kendi
      // açık genişliği olan bir kutu — td'nin min-content'ine katkısı tam olarak bu kutunun
      // genişliği + td'nin kendi yatay dolgusudur (px-3 = 12+12 = 24px; ÖLÇÜLEREK doğrulandı: iç
      // kutuya 170px verilince td 194px'e çıkıyordu, 170+24). Bu yüzden iç kutu, td'nin
      // `meta.width`'inden TAM 24px daha dar seçilir (106 = 130-24) — td tam 130px'te durur. Ürün
      // adları bugünkü veride ≤25 karakter (~186px) — bounded kutu bunu kırparak karşılar (tam ad
      // `title`'da).
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { width: 130, mobile: 'title' }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[106px]" title={row.original.productName}>{row.original.productName}</span> },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { width: 90, mobile: 'subtitle', className: 'font-mono text-xs' } },
      {
        id: 'risk', accessorFn: (r) => r.risk, header: 'Risk', meta: { width: 100, mobile: 'badge' },
        cell: ({ row }) => <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', RISK_CLASS[row.original.risk])}>{RISK_LABEL[row.original.risk]}</span>,
      },
      { accessorKey: 'available', header: 'Kullanılabilir', meta: { align: 'right', width: 110 }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{formatQty(row.original.available)}</span> },
      // Min/Max tek 'Min–Max' sütununda birleştirildi (80+80=160 -> 110, 50px kazanç; tur 2 P0
      // tedarik-kritik-stok-04 suggestedFix). Değerler kural düzenleme drawer'ında ayrı ayrı kalır.
      {
        id: 'minMax', header: 'Min–Max', meta: { align: 'right', width: 110, mobile: 'hidden' },
        cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{formatQty(row.original.minQty)}–{formatQty(row.original.maxQty)}</span>,
      },
      {
        accessorKey: 'daysOfCover', header: 'Kapsama (gün)', meta: { align: 'right', width: 110 },
        cell: ({ row }) => (row.original.daysOfCover === null ? <span className="text-muted-foreground">—</span> : <span className="font-mono text-[13px] tabular-nums">{D(row.original.daysOfCover).toFixed(1)}</span>),
      },
      { accessorKey: 'leadTimeDays', header: 'Tedarik süresi', meta: { align: 'right', width: 110, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.leadTimeDays} gün</span> },
      {
        id: 'suggestedQty', accessorFn: (r) => r.suggestedQty, header: 'Önerilen sipariş', meta: { align: 'right', width: 130 },
        cell: ({ row }) => (D(row.original.suggestedQty).gt(0) ? <span className="font-mono text-[13px] font-medium tabular-nums text-primary">{formatQty(row.original.suggestedQty)}</span> : <span className="text-muted-foreground">—</span>),
      },
      // width + iç sabit-genişlikli flex kutu (tur 2 P0 tedarik-kritik-stok-04 kök nedeni): eskiden
      // yalnızca `overflow-hidden` bir <div> + `truncate` bir <span> vardı — İKİSİ DE kendi CSS
      // genişliği TANIMLAMIYORDU (width:auto), bu yüzden `table-layout:auto`'nun min-content
      // hesabında hâlâ tedarikçi adının TAM metin genişliğine (ör. "Proteinsan Gıda Hammaddeleri
      // Ltd. Şti." ~355px) geri düşülüyordu — td'nin `meta.width:200`'ü yalnızca bir İPUCU, içerik
      // onu aştığında göz ardı ediliyordu (muhasebe/journal-entries-table.tsx `description`
      // sütununun DÜZELTME 2 notuyla birebir aynı kök neden). Kesin çözüm: dış kutunun KENDİSİNE
      // açık bir genişlik (`w-[170px]`) — blok kutular normal akışta belirtilen genişliği içeriğe
      // göre büyütmez, td'nin min-content'ine katkısı artık tam olarak 170px'tir. İçindeki metin
      // span'ine `min-w-0` verildi ki flex item olarak kendi içeriğine göre büyümeye direnmesin,
      // `truncate` gerçekten bu 170px'in İÇİNDE kırpabilsin (rozet `shrink-0` ile sabit kalır).
      {
        id: 'preferredSupplierName', accessorFn: (r) => r.preferredSupplierName, header: 'Tercihli tedarikçi', meta: { width: 170, mobile: 'hidden' },
        cell: ({ row }) => (
          <div className="flex w-[170px] items-center gap-1.5 overflow-hidden">
            <span className="min-w-0 truncate" title={row.original.preferredSupplierName ?? undefined}>{row.original.preferredSupplierName ?? <span className="text-muted-foreground">—</span>}</span>
            {row.original.isAutoOrderWhitelisted && row.original.supplierWhitelisted ? <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-success/12 px-1.5 text-[10px] font-medium text-success">Beyaz liste</span> : null}
          </div>
        ),
      },
      // defaultHidden (tur 2 P0 tedarik-kritik-stok-04 suggestedFix): az bakılan sütun masaüstünde
      // varsayılan gizli — sütun seçiciden açılabilir, taşmaya katkısı başlangıçta sıfır (muhasebe/
      // invoices-table.tsx'teki e-Belge/Kanal ile aynı kalıp).
      { id: 'lastEvaluatedAt', accessorFn: (r) => r.lastEvaluatedAt, header: 'Son değerlendirme', meta: { width: 150, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => (row.original.lastEvaluatedAt ? formatDateTime(row.original.lastEvaluatedAt) : <span className="text-muted-foreground">Hiç çalışmadı</span>) },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'risk', title: 'Risk', options: [{ value: 'critical', label: 'Kritik' }, { value: 'warning', label: 'Uyarı' }, { value: 'none', label: 'Normal' }] },
  ];

  return (
    <DataTable
      columns={columns}
      data={filtered}
      getRowId={(r) => r.ruleId}
      searchPlaceholder="Ürün, SKU ara…"
      filters={filters}
      initialSorting={[{ id: 'suggestedQty', desc: true }]}
      emptyTitle={filterEmptied ? 'Filtreye uyan kural yok' : 'Kritik stok kuralı yok'}
      emptyDescription={filterEmptied ? `${rows.length} kuralın hiçbiri kritik/uyarı değil.` : 'Kural tanımlı ürün bulunamadı.'}
      emptyAction={filterEmptied && onClearFilter ? <Button variant="outline" size="sm" onClick={onClearFilter}>Filtreyi temizle</Button> : undefined}
      rowActions={canManageRule && onEditRule ? (row) => [{ label: 'Kuralı düzenle', icon: SlidersHorizontal, onSelect: () => onEditRule(row) }] : undefined}
    />
  );
}

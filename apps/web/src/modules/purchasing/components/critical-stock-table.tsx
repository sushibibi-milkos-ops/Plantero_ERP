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

// 'unknown' (motor hiç çalışmadı) 'none' (Normal — motor değerlendirdi, risk yok) ile KASITLI
// olarak ayrı bir rozet: ikisini aynı göstermek "bilinmiyor" u "risk yok" gibi sunar (Tur 3 P0
// tedarik-kritik-stok-06). 'Normal' yeşil değil nötr — burada yalnızca 'unknown' ile ayrışması
// gereken görsel budur; 'none' zaten var olan nötr `bg-muted` tonunu korur.
const RISK_LABEL: Record<CriticalStockRow['risk'], string> = { critical: 'Kritik', warning: 'Uyarı', none: 'Normal', unknown: 'Değerlendirilmedi' };
const RISK_CLASS: Record<CriticalStockRow['risk'], string> = {
  critical: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning',
  none: 'bg-muted/60 text-muted-foreground',
  unknown: 'bg-muted/40 text-muted-foreground/70',
};

export function CriticalStockTable({
  rows, onlyCritical, canManageRule, onEditRule, onClearFilter,
}: {
  rows: CriticalStockRow[]; onlyCritical: boolean; canManageRule?: boolean; onEditRule?: (row: CriticalStockRow) => void;
  /** "Sadece kritik/uyarı" filtresini kapatır — filtre kaynaklı boş durumun eylemi (Tur 1 P0 tedarik-kritik-stok-02). */
  onClearFilter?: () => void;
}) {
  // 'unknown' (motor hiç çalışmadı) "kritik/uyarı" DEĞİLDİR — `!== 'none'` filtresi 'unknown'ı da
  // içeri alıp "Sadece kritik/uyarı" açıkken değerlendirilmemiş satırları kritikmiş gibi gösterirdi.
  const filtered = useMemo(() => (onlyCritical ? rows.filter((r) => r.risk === 'critical' || r.risk === 'warning') : rows), [rows, onlyCritical]);
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

  // Tur 5 P1 tedarik-kritik-stok-09/10 kök neden: motor hiç çalışmamışken (lastEvaluatedAt tüm
  // satırlarda NULL) 'Kapsama (gün)' ve 'Önerilen sipariş' sütunları 36/36 satırda '—' basıyordu —
  // 257px'lik ölü genişlik hem sütun ızgarasını kabın (1152px) dışına taşırıyor (37px) hem de
  // ekranın karar veremediği bir durumu boş sütunlarla dolduruyordu. Aynı modülün PO detayı, tümü
  // boş 'Beklenen tarih' sütununu HİÇ render etmiyor (tedarik-po-detay-06) — aynı kural burada da:
  // motor hiç çalışmamışsa bu iki sütun sütun listesinden tamamen çıkar (perCol'da bulunmaz),
  // motor çalıştıktan sonra (herhangi bir satırda lastEvaluatedAt doluysa) geri döner.
  const hasEvaluation = useMemo(() => rows.some((r) => r.lastEvaluatedAt !== null), [rows]);

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
      // width 130 -> 190 (Tur 6 P1 tedarik-kritik-stok-13): motor hiç çalışmamışken 'Risk' sütunu
      // tamamen kaldırılır (aşağıda), boşalan genişlik iki kimlik sütunu ('Ürün', 'Tercihli
      // tedarikçi') arasında paylaştırılır — ikisi de 36/36 satırda kırpılıyordu.
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { width: 190, mobile: 'title' }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[166px]" title={row.original.productName}>{row.original.productName}</span> },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { width: 90, mobile: 'subtitle', className: 'font-mono text-xs' } },
      // Tur 6 P1 tedarik-kritik-stok-13 kök neden: motor hiç çalışmamışken (hasEvaluation=false)
      // 'Risk' sütunu 36/36 satırda AYNI tek değeri ('Değerlendirilmedi') basıyordu — bilgi taşımayan
      // bu sütun tablonun %15,2'sini yiyip iki kimlik sütununu ('Ürün', 'Tercihli tedarikçi') kırpmaya
      // zorluyordu. Üstteki amber şerit zaten "Motor henüz çalıştırılmadı" diyor; 'Kapsama (gün)' /
      // 'Önerilen sipariş' ile AYNI kalıp (tedarik-kritik-stok-10): veri hiç yoksa sütun render
      // edilmez, motor çalışıp herhangi bir satırda gerçek risk değeri oluşunca geri döner.
      ...(hasEvaluation
        ? ([
            {
              id: 'risk', accessorFn: (r: CriticalStockRow) => r.risk, header: 'Risk', meta: { width: 132, mobile: 'badge' },
              cell: ({ row }: { row: { original: CriticalStockRow } }) => <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', RISK_CLASS[row.original.risk])}>{RISK_LABEL[row.original.risk]}</span>,
            },
          ] as ColumnDef<CriticalStockRow, unknown>[])
        : []),
      {
        // 'available' null ise (motor hiç çalışmadı) '0' DEĞİL '—' — 'Kapsama'/'Önerilen sipariş'
        // sütunlarıyla aynı dil (Tur 3 P0 tedarik-kritik-stok-06). mobile:'meta' (Tur 5 P1
        // tedarik-kritik-stok-11 kök neden): bu sütun motor çalışmasa BİLE canlı stoktan dolan TEK
        // karar bilgisiydi ama mobil kartta hiç sınıflandırılmamıştı (`mobile` alanı yoktu) — mobil
        // kart bunu `rest`e düşürüyor, `rest`in SONUNCUSU (`suggestedQty`, motor çalışmadan hep '—')
        // tek "metrik" olarak seçiliyor, kart 36/36 satırda hiçbir sayı taşımıyordu.
        accessorKey: 'available', header: 'Kullanılabilir', meta: { align: 'right', width: 110, mobile: 'meta' },
        cell: ({ row }) => (row.original.available === null ? <span className="text-muted-foreground">—</span> : <span className="font-mono text-[13px] tabular-nums">{formatQty(row.original.available)}</span>),
      },
      // Min/Max tek 'Min–Max' sütununda birleştirildi (80+80=160 -> 110, 50px kazanç; tur 2 P0
      // tedarik-kritik-stok-04 suggestedFix). Değerler kural düzenleme drawer'ında ayrı ayrı kalır.
      {
        // accessorFn eklendi (Tur 5 P1 tedarik-kritik-stok-11): mobil kartın `isEmptyValue(getValue())`
        // kontrolü accessor'sız bir sütunda hep `undefined` okur (kolon yalnızca `cell` render
        // ediyordu) — bu da sütunu HER ZAMAN boş sayıp meta zincirinden düşürürdü, `mobile:'meta'`
        // versem bile hiç görünmezdi. minQty asla null değil (kural her zaman min/max taşır).
        id: 'minMax', accessorFn: (r) => r.minQty, header: 'Min–Max', meta: { align: 'right', width: 110, mobile: 'meta' },
        cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{formatQty(row.original.minQty)}–{formatQty(row.original.maxQty)}</span>,
      },
      // Tur 5 P1 tedarik-kritik-stok-09/10 kök neden: motor hiç çalışmamışken bu iki sütun 36/36
      // satırda '—' basıyordu (257px ölü genişlik) hem sütun ritmini bozuyor hem de sabit
      // meta.width toplamını kabın (1152px) üstüne taşıyordu. PO detayının 'Beklenen tarih' sütunuyla
      // (tedarik-po-detay-06) AYNI kural: veri hiç yoksa sütun hiç render edilmez, veri gelince döner.
      ...(hasEvaluation
        ? ([
            {
              accessorKey: 'daysOfCover', header: 'Kapsama (gün)', meta: { align: 'right', width: 110 },
              cell: ({ row }) => (row.original.daysOfCover === null ? <span className="text-muted-foreground">—</span> : <span className="font-mono text-[13px] tabular-nums">{D(row.original.daysOfCover).toFixed(1)}</span>),
            },
          ] as ColumnDef<CriticalStockRow, unknown>[])
        : []),
      { accessorKey: 'leadTimeDays', header: 'Tedarik süresi', meta: { align: 'right', width: 110, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.leadTimeDays} gün</span> },
      ...(hasEvaluation
        ? ([
            {
              // mobile:'hidden' (Tur 5 P1 tedarik-kritik-stok-11 suggestedFix): motor çalışmadan hep
              // '—' olduğu için önceden mobil kartın TEK "metrik"i buydu — artık Kullanılabilir/Min–Max
              // o rolü aldığı için bu sütun mobilde gösterilmez (masaüstünde kalır).
              id: 'suggestedQty', accessorFn: (r: CriticalStockRow) => r.suggestedQty, header: 'Önerilen sipariş', meta: { align: 'right', width: 130, mobile: 'hidden' },
              cell: ({ row }) => (D(row.original.suggestedQty).gt(0) ? <span className="font-mono text-[13px] font-medium tabular-nums text-primary">{formatQty(row.original.suggestedQty)}</span> : <span className="text-muted-foreground">—</span>),
            },
          ] as ColumnDef<CriticalStockRow, unknown>[])
        : []),
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
        // Tur 5 P2 tedarik-kritik-stok-12 kök neden: "Beyaz liste" rozeti 36 satırın yalnızca
        // 1'inde beliriyordu (nadir durum tek satırda sütun ritmini bozuyordu) VE tedarikçi adını
        // kırparak yer açıyordu — aynı bilgi zaten `/satin-alma/tedarikciler` kendi sütununda var.
        // Rozet tamamen kaldırıldı; ad kutusu artık rozet için ayrılan `gap-1.5 shrink-0` alanı
        // olmadan meta.width'in (190) TAMAMINI (166 = 190 - td dolgusu 24) kırpmadan kullanıyor.
        // width 190 -> 300 (Tur 6 P1 tedarik-kritik-stok-13): 'Risk' sütununün kaldırdığı genişlikle
        // birlikte bu kolon büyütüldü — 36/36 satırda kırpılan tedarikçi adı artık %20'nin altına iner.
        id: 'preferredSupplierName', accessorFn: (r) => r.preferredSupplierName, header: 'Tercihli tedarikçi', meta: { width: 300, mobile: 'hidden' },
        cell: ({ row }) => (
          // w-[276px] = meta.width(300) - td dolgusu(24) — bkz. yukarıdaki `productName` notu, ölçüm
          // ile doğrulanan aynı formül (iç kutu td'nin dolgusu KADAR dar seçilirse td tam meta.width'te durur).
          <span className="inline-block w-[276px] truncate align-bottom" title={row.original.preferredSupplierName ?? undefined}>
            {row.original.preferredSupplierName ?? <span className="text-muted-foreground">—</span>}
          </span>
        ),
      },
      // defaultHidden (tur 2 P0 tedarik-kritik-stok-04 suggestedFix): az bakılan sütun masaüstünde
      // varsayılan gizli — sütun seçiciden açılabilir, taşmaya katkısı başlangıçta sıfır (muhasebe/
      // invoices-table.tsx'teki e-Belge/Kanal ile aynı kalıp).
      { id: 'lastEvaluatedAt', accessorFn: (r) => r.lastEvaluatedAt, header: 'Son değerlendirme', meta: { width: 150, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => (row.original.lastEvaluatedAt ? formatDateTime(row.original.lastEvaluatedAt) : <span className="text-muted-foreground">Hiç çalışmadı</span>) },
    ],
    [hasEvaluation],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'risk', title: 'Risk', options: [{ value: 'critical', label: 'Kritik' }, { value: 'warning', label: 'Uyarı' }, { value: 'none', label: 'Normal' }, { value: 'unknown', label: 'Değerlendirilmedi' }] },
  ];

  // Tur 4 P1 tedarik-kritik-stok-07 kök neden: DataTable hover'ı yalnızca `clickable`
  // (rowHref||onRowClick) satırlara veriyor (data-table.tsx:256) — bu tablo ikisini de geçmiyordu,
  // satır arka planı hover'da değişmiyordu ama satır aksiyon düğmesi ('…') yine de beliriyordu.
  // Satır zaten var olan "Kuralı düzenle" eylemini açsın: `onRowClick` ile aynı davranış —
  // hover arka planı, imleç ve klavye erişimi artık ortak bileşenden gelir, modülün geri kalanıyla
  // (siparişler, sipariş detayı) aynı satır davranışı.
  const editRule = canManageRule ? onEditRule : undefined;

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
      onRowClick={editRule}
      rowActions={editRule ? (row) => [{ label: 'Kuralı düzenle', icon: SlidersHorizontal, onSelect: () => editRule(row) }] : undefined}
    />
  );
}

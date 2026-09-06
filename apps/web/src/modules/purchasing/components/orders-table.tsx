'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type { PurchaseOrderRow } from '../queries';

export function OrdersTable({ orders }: { orders: PurchaseOrderRow[] }) {
  const columns = useMemo<ColumnDef<PurchaseOrderRow, unknown>[]>(
    () => [
      {
        // Tur 4 P2 tedarik-siparisler-04 kök neden: 'AI' işareti başlıksız (`header:''`) ama
        // SIRALANABİLİR ayrı bir sütundaydı (`Durum`/`Alınan` arasında boş bir th + 16.6x28px
        // sıralama düğmesi) — Linear'da adsız sıralanabilir sütun yok. İşaret, zaten sıralanamayan
        // (aria-label taşıyan) belge no hücresine taşındı; ayrı sütun tamamen kaldırıldı.
        id: 'docNo', accessorFn: (r) => r.docNo, header: 'Sipariş no', meta: { width: 150, mobile: 'title', className: 'font-mono' },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.docNo}
            {/* Tur 9 P2 tedarik-siparisler-05 kök neden: --primary iki anlama geliyordu (birincil eylem
             * butonu + bu veri işareti) — approval-queue-list.tsx:129 zaten text-muted-foreground kullanıyor,
             * bu sütun da aynı nötr tona alındı. */}
            {row.original.isAiGenerated ? <Sparkles className="size-3.5 shrink-0 text-muted-foreground" aria-label="AI taslağı" /> : null}
          </span>
        ),
      },
      // width + iç inline-block (tur 2 P0 tedarik-siparisler-03 kök nedeni — DÜZELTME 2): yalnızca
      // `meta.className:'truncate'` (td üzerinde) YETMEZ — `table-layout:auto`'da bir td'nin
      // min-content genişliği İÇERİĞİNDEN (burada `white-space:nowrap` bir metin, "Kahve Dünyası
      // Yeşil Kahve ve Egzotik Ürünler Ltd. Şti." ~355px) hesaplanır; td'ye verilen `width` yalnızca
      // bir İPUCUDUR ve içerik onu aşınca göz ardı edilir (muhasebe/journal-entries-table.tsx'teki
      // `description` sütununun DÜZELTME 2 notuyla birebir aynı kök neden — bkz. orada). Kesin çözüm:
      // hücrenin TEK çocuğu olarak KENDİ AÇIK CSS genişliği olan bir kutu (`md:w-[280px]`) — blok
      // kutular normal akışta belirtilen genişliği içeriğe göre küçültmez, bu yüzden td'nin
      // min-content'ine katkısı tam olarak 280px'tir; taşan metin `truncate` ile bu sabit kutunun
      // İÇİNDE kırpılır (tam ad `title` özniteliğinde). `inline-block` + `md:` (yalnızca masaüstü):
      // mobil kartta bu hücre `subtitle` rolüyle bir flex satırına gömülür — sabit genişlik orada
      // YOKTUR, `max-w-full truncate` üst bağlamın kendi genişliğine göre küçülür.
      // width 280 -> 362 (Tur 9 P2 tedarik-colwidth-lock-01 kök neden): 7 sütunun tamamı `meta.width`
      // taşıyor ve toplamları (1060px) kabın (1152px) altında kalıyordu — tarayıcı aradaki 92px'i
      // sütunlara dağıtıyor (th 280 -> 319) ama iç kutu ESKİ 280'e göre 256px'te sabit kalıp 2/16
      // satırda kırpıyordu. Boşluğun tamamı bu sütuna verilip (150+362+170+90+130+120+130 = 1152 =
      // kap) dağıtılacak boşluk sıfırlandı — th artık tam 362px'te sabit durur ('Durum' sütununun
      // organik ihtiyacı olan 10px aşağıda ona verildi, bkz. o sütunun notu).
      { accessorKey: 'partnerName', header: 'Tedarikçi', meta: { width: 359, mobile: 'subtitle' }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[335px]" title={row.original.partnerName}>{row.original.partnerName}</span> },
      // width 160 -> 170: rozet metni (StatusBadge, ör. "Kısmen teslim alındı") 160px'te bile organik
      // olarak 170px istiyordu (probe ile ölçüldü) — yukarıdaki `partnerName`'den 10px alındı.
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 170, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="purchase_order" /> },
      { accessorKey: 'receivedPct', header: 'Alınan', meta: { align: 'right', width: 90 }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">%{Math.round(row.original.receivedPct)}</span> },
      // Tur 4 P2 tedarik-siparisler-04 kök neden (devamı): tarih hücreleri orantılı rakamla
      // (fontVariantNumeric:'normal') basılıyordu — sütun ragged hizalanıyordu. `tabular-nums`
      // eklendi (mono YAPILMADI — modülün tarih hücreleri hiçbir yerde mono değil, yalnızca
      // rakam genişliği sabitlenir).
      { accessorKey: 'expectedDate', header: 'Beklenen tarih', meta: { width: 130, mobile: 'hidden' }, cell: ({ row }) => (row.original.expectedDate ? <span className="tabular-nums">{formatDate(row.original.expectedDate)}</span> : <span className="text-muted-foreground">—</span>) },
      // Tur 1 P1 tedarik-siparisler-01/02 kök neden: mobil kartın tek metriği "rest" hücrelerinin
      // SONUNCUSU (DataTableMobileCards) — `orderDate` tutardan SONRA tanımlıydı ve mobil rolü yoktu,
      // metrik yuvasına tutar yerine sipariş tarihi düşüyordu. `mobile:'meta'` ile tarih artık 2.
      // satırda cari adının yanında bir ipucu olarak görünür (muhasebe/invoices-table.tsx'teki
      // `dueDate` ile aynı kalıp — kriter 11), `grandTotal` tabloda SONA alınarak "rest" grubunun
      // son (ve tek gösterilen) elemanı, dolayısıyla mobil metrik, oldu.
      { accessorKey: 'orderDate', header: 'Sipariş tarihi', meta: { width: 120, mobile: 'meta' }, cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.orderDate)}</span> },
      { accessorKey: 'grandTotal', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.grandTotal} /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('purchase_order') }];

  return (
    <DataTable
      columns={columns}
      data={orders}
      getRowId={(r) => r.id}
      rowHref={(r) => `/satin-alma/siparisler/${r.id}`}
      searchPlaceholder="Sipariş no, tedarikçi ara…"
      filters={filters}
      initialSorting={[{ id: 'orderDate', desc: true }]}
      emptyTitle="Henüz satın alma siparişi yok"
      emptyDescription="Yeni sipariş oluşturun veya kritik stok motorunu çalıştırın."
    />
  );
}

'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { cn } from '@/lib/utils';
import { formatQty } from '@/lib/format';
import { D } from '@plantero/core/money';
import type { getDeliveryDetail } from '../queries';

type DeliveryDetail = NonNullable<Awaited<ReturnType<typeof getDeliveryDetail>>>;
type DeliveryLineRow = DeliveryDetail['lines'][number];

/**
 * Sevkiyat detay satır tablosu. `DataTable` client bileşenidir — sütun/hücre tanımları (fonksiyon
 * içeren) bir server component'ten doğrudan prop olarak geçilemez (RSC serileştirme hatası: "Functions
 * cannot be passed directly to Client Components"). Bu yüzden diğer modül tabloları (deliveries-table.tsx
 * vb.) gibi kendi 'use client' sarmalayıcısında tanımlanır; sayfa yalnızca serileştirilebilir veri geçer.
 *
 * Liste sayfalarıyla aynı tablo dili: kutulu `<Table>` yerine `DataTable` — mobilde otomatik kart
 * görünümüne düşer, masaüstünde `scroll-fade-x` ile kaydırma ipucu verir (Tur 3 P0/P1 bulguları).
 */
export function DeliveryLinesTable({ lines }: { lines: DeliveryLineRow[] }) {
  const columns = useMemo<ColumnDef<DeliveryLineRow, unknown>[]>(
    () => [
      { id: 'productName', accessorFn: (r) => r.productName, header: 'Ürün', meta: { mobile: 'title' }, cell: ({ row }) => <span className="font-medium">{row.original.productName}</span> },
      { id: 'sku', accessorFn: (r) => r.sku, header: 'SKU', meta: { mobile: 'subtitle', className: 'font-mono text-xs text-muted-foreground' } },
      // Kök neden (Tur 11 P1 depo-sevkiyat-id-01): "Talep" mobilde işaretsiz kaldığı için `rest`e
      // düşüyor, ama tek metrik kuralı `rest`in SONUNCUSUNU seçtiği için (o zaman "Kaynak") bu sütun
      // ve "Toplanan" ikisi de mobil kartta hiç görünmüyordu — operatörün asıl ihtiyacı olan
      // toplanan/talep oranı kayboluyordu. Talep artık mobilde tamamen gizli: değeri zaten aşağıdaki
      // "Toplanan" hücresinde oran olarak (ör. "10/10 ADET") tekrar basılıyor, ayrıca göstermeye
      // gerek yok.
      { id: 'qty', accessorFn: (r) => r.line.qty, header: 'Talep', meta: { align: 'right', width: 100, mobile: 'hidden' }, cell: ({ row }) => <QtyCell value={row.original.line.qty} uom={row.original.uomCode} /> },
      // Toplanan/talep oranı tek hücrede: "10/10 ADET". Mobil kartta tek metrik bu sütun olacağı için
      // (bkz. aşağıdaki not) yalnızca toplanan miktarı değil, tamamlanma oranını da taşır — operatörün
      // detay sayfasına girmeden göreceği tek sayı budur. Eksik toplama (picked < qty) `text-warning`
      // ile işaretlenir; tam toplama nötr.
      {
        id: 'pickedQty',
        accessorFn: (r) => r.line.pickedQty,
        header: 'Toplanan',
        meta: { align: 'right', width: 120 },
        cell: ({ row }) => {
          const picked = row.original.line.pickedQty;
          const requested = row.original.line.qty;
          const incomplete = D(picked).lt(D(requested));
          return (
            <span className={cn('num inline-flex items-baseline justify-end gap-1 whitespace-nowrap', incomplete && 'text-warning')}>
              <span className="tabular-nums">
                {formatQty(picked, undefined, { maxDigits: 3 })}/{formatQty(requested, undefined, { maxDigits: 3 })}
              </span>
              <span className="font-sans text-[11px] text-muted-foreground">{row.original.uomCode}</span>
            </span>
          );
        },
      },
      // Kök neden (Tur 10 P1 depo-lotlar-01'in aynısı — bkz. lots-table.tsx): `id` verilince LotBadge
      // linke dönüşür ve mobilde dokunma hedefi için `h-11` (44px) sabit yükseklik alır; bu satır
      // BADGE rolünde satır 1'e oturduğu için tüm satır 1'i 44px'e zorluyor, kartı 72px hedefinin
      // üstüne taşıyordu (87.5px ölçüldü). Aynı düzeltme: `id` kaldırıldı — LotBadge düz mono metin
      // olarak kalır, lot detayına gitmek isteyen kullanıcı `/depo/lotlar`dan arayabilir.
      {
        id: 'lot',
        accessorFn: (r) => r.lotNo,
        header: 'Lot',
        meta: { mobile: 'badge' },
        cell: ({ row }) => (row.original.lotNo ? <LotBadge lotNo={row.original.lotNo} status={row.original.lotStatus} /> : <span className="text-xs text-muted-foreground">Lotsuz</span>),
      },
      // Kök neden (Tur 11 P1 depo-sevkiyat-id-01, devamı): SKT önceden `meta.mobile` işaretsizdi ve
      // `rest`e düşüyordu. Artık `badge` — lot rozetinin yanına, satır 1'in sağına oturur (SKT rozeti
      // zaten kompakt bir pil, ikinci rozet için tasarlanan `max-w-[45%]` payına sığar).
      {
        id: 'expiryDate',
        accessorFn: (r) => r.expiryDate,
        header: 'SKT',
        meta: { width: 110, mobile: 'badge' },
        cell: ({ row }) => (row.original.expiryDate ? <ExpiryBadge date={row.original.expiryDate} showDate={false} /> : <span className="text-xs text-muted-foreground/60">—</span>),
      },
      // Kök neden (Tur 5 P1): bu sütun mobil `meta.mobile` işaretlemiyordu, bu yüzden mobil kartın
      // ortak `<dl>` alanına (mobile-cards.tsx) düşüyordu — orada ETİKET küçülür/kırpılır, DEĞER
      // küçülmez (para değerlerinin kırpılmasını önlemek için Tur 4'te bilerek böyle kurulmuştu).
      // Kısa sayısal değerler için bu doğru, ama uzun bir lokasyon kodu ("TIRE/MAMUL/R01") için ters
      // yönde kırılıyordu: etiket "Kayn…"e kesiliyor, DEĞER kart kenarını taşıyordu. İki parçalı
      // düzeltme: başlık kısaltıldı ("Kaynak" — artık kırpma gerekmez) ve değere yerel sabit
      // `max-w` + `truncate` verildi (paylaşılan `dd`nin `shrink-0` davranışını değiştirmeden, yalnızca
      // bu hücrede taşmayı engeller).
      // Tur 11 P1 (devamı): mobilde `meta.mobile:'meta'` — artık `rest`in tek/sonuncu elemanı
      // "Toplanan" (toplanan/talep oranı) olur; lokasyon kodu satır 2'nin sol tarafına bağlam
      // ipucu olarak düşer.
      // Tur 12 P1 düzeltmesi (depo-sevkiyat-id-02): aynı `cell` render'ı hem masaüstü tablo hücresinde
      // hem mobil kartın satır-2 "meta" akışında (mobile-cards.tsx leftBits) kullanılıyor — `block` bir
      // KUTU açar, mobil karttaki tek satırlık `whitespace-nowrap` metin akışını (o akış zaten kendi
      // `text-ellipsis`ini uyguluyor) böler ve lokasyon kodu alt satıra düşüyordu (kart 82.3px). `block`
      // + `max-w-[140px]` + kendi `truncate`i yalnızca masaüstü sütun genişliğini sınırlamak içindi;
      // `md:` önekiyle yalnızca ≥768px'te (masaüstü tablo, mobil kart zaten `md:hidden` konteynerde)
      // etkinleşir. <768px'te span düz `inline` kalır, kırpma tamamen üst akışın `text-ellipsis`ine
      // bırakılır.
      {
        id: 'locationCode',
        accessorFn: (r) => r.locationCode,
        header: 'Kaynak',
        meta: { width: 130, className: 'font-mono text-xs text-muted-foreground', mobile: 'meta' },
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return (
            <span className="font-mono md:block md:max-w-[140px] md:truncate" title={v ?? undefined}>
              {v ?? '—'}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={lines}
      getRowId={(l) => l.line.id}
      searchable={false}
      columnToggle={false}
      pagination={false}
      emptyTitle="Satır yok"
    />
  );
}

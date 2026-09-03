'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyCell } from '@/components/empty-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SalesDocRow } from '../queries';

/**
 * Teslim + fatura ilerlemesini tek dar sütunda gösterir: iki nokta aynı tonda (bg-primary),
 * farkı konum (sol=teslim, sağ=fatura) verir — iki ayrı renk yerine tek kavram/tek dil.
 * %100 → dolu, %0 → boş halka, ara değer → yarı dolu halka; gerçek yüzde title'da.
 */
function ProgressDot({ pct, label }: { pct: number; label: string }) {
  const state = pct >= 100 ? 'full' : pct > 0 ? 'partial' : 'empty';
  return (
    <span
      title={`${label}: %${pct}`}
      aria-label={`${label === 'T' ? 'Teslim' : 'Fatura'}: yüzde ${pct}`}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-semibold tabular-nums',
        state === 'full' && 'bg-primary text-primary-foreground',
        state === 'partial' && 'border border-primary text-primary',
        state === 'empty' && 'border border-border text-muted-foreground/40',
      )}
    >
      {label}
    </span>
  );
}

/**
 * Yoğun mobil kart (Tur 5 P1 bulgusu): DataTable'ın varsayılan kart üretici algoritması 6 alanı
 * ayraçlı ayrı dikey satırlara açıp her satırda etiketi tekrar ediyordu — /satis/siparisler'de
 * ~141px, /satis/teklifler'de ~113px/kart (30 sipariş ~4.230px kaydırma). `renderMobileCard`
 * ORTAK bileşeni (apps/web/src/components/data-table) DEĞİŞTİRMEDEN, DataTable'ın zaten desteklediği
 * özel kart kancasıyla ~76px'e indirir: başlık satırı (belge no + durum), alt başlık (cari · kanal),
 * tek meta satırı (tarih solda, genel toplam sağda) — "Tarih"/"Net ciro"/"Genel toplam" etiketleri
 * karttan kaldırılır (sütun başlıkları mobilde gereksiz kroni).
 */
function DocCard({ row, docType }: { row: SalesDocRow; docType: 'quotation' | 'order' }) {
  return (
    <div className="cursor-pointer rounded-lg border border-border/70 bg-card p-3 active:bg-accent/50">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[13px] font-medium">{row.docNo}</span>
        <StatusBadge status={row.status} kind="sales_order" />
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {row.partnerName}
        {row.channelName ? ` · ${row.channelName}` : ''}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDate(row.orderDate)}
          {docType === 'quotation' && row.validUntil ? ` · gçrl. ${formatDate(row.validUntil)}` : ''}
        </span>
        <MoneyCell value={row.grandTotal} currency={row.currency} className="shrink-0 font-medium text-foreground" />
      </div>
    </div>
  );
}

export function SalesDocsTable({ rows, docType }: { rows: SalesDocRow[]; docType: 'quotation' | 'order' }) {
  const basePath = docType === 'quotation' ? '/satis/teklifler' : '/satis/siparisler';

  const columns = useMemo<ColumnDef<SalesDocRow, unknown>[]>(() => {
    const cols: ColumnDef<SalesDocRow, unknown>[] = [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { width: 120, mobile: 'title', className: 'font-mono' } },
      {
        id: 'partnerName', accessorFn: (r) => r.partnerName, header: docType === 'quotation' ? 'Cari' : 'Müşteri', meta: { width: 200, mobile: 'subtitle' },
        cell: ({ row }) => <span className="block max-w-44 truncate" title={row.original.partnerName}>{row.original.partnerName}</span>,
      },
      {
        // Mobil kartta tamamen düşürülmek yerine ' · ' ile alt başlığın yanına eklenir (bkz.
        // DataTableMobileCards `meta` rolü) — desktop'ta kanal bilgisi kartta hiç görünmüyordu.
        // Renkli nokta kaldırıldı (Tur 4 P2 bulgusu): 7 kanal 7 farklı hue kullanıyordu, renk burada
        // anlam değil kimlik taşıyordu ve monokrom + tek vurgu rengi disiplinini kırıp 30 satırlık
        // tabloda gökkuşağı etkisi yapıyordu; ayrıca /satis/kanallar tablosu (channels-table.tsx) aynı
        // kanalları hiç noktasız, düz metin olarak gösteriyordu — aynı varlık iki ekranda iki farklı
        // temsile sahipti. İkisi de artık aynı gösterimi kullanıyor: düz, soluk metin.
        id: 'channelName', accessorFn: (r) => r.channelName, header: 'Kanal', meta: { width: 100, mobile: 'meta' },
        cell: ({ row }) => <span className="block max-w-full truncate text-muted-foreground">{row.original.channelName}</span>,
      },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="sales_order" /> },
      {
        id: 'orderDate', accessorFn: (r) => r.orderDate, header: 'Tarih', meta: { width: docType === 'quotation' ? 100 : 90, className: docType === 'quotation' ? 'whitespace-normal' : undefined },
        cell: ({ row }) =>
          // Ayrı "Geçerlilik" sütunu kaldırıldı (Tur 5 P2 bulgusu): 4 satırın 3'ünde '—' basıp
          // 130px'lik en geniş sütunlardan biri sıfır bilgi taşıyordu — dolu olduğunda "Tarih"
          // hücresinin altına 11px soluk ikinci satır olarak taşındı, boşken hiçbir yer tutucu bırakmaz.
          docType === 'quotation' ? (
            <div className="leading-tight">
              <div>{formatDate(row.original.orderDate)}</div>
              {row.original.validUntil ? <div className="text-[11px] text-muted-foreground">gçrl. {formatDate(row.original.validUntil)}</div> : null}
            </div>
          ) : (
            formatDate(row.original.orderDate)
          ),
      },
    ];
    if (docType !== 'quotation') {
      cols.push(
        // defaultHidden: 30 satırın 24'ünde değer em-dash (sütun seçiciden açılabilir kalır) — 1440px'te
        // taşan tabloda en sağdaki "Genel toplam" büyük ölçüde boş bir sütuna kırpılıyordu (Tur 3 P2).
        { id: 'externalOrderNo', accessorFn: (r) => r.externalOrderNo ?? '', header: 'Dış no', meta: { width: 100, mobile: 'hidden', defaultHidden: true, className: 'font-mono text-xs' }, cell: ({ row }) => row.original.externalOrderNo || <EmptyCell /> },
        {
          // Sütun başlığı sırasız olduğundan (enableSorting:false) DataTableColumnHeader'ın
          // sıralanabilir sarmalayıcısını atlayıp özel bir başlık veriyoruz: `title` ile ipucu
          // (60 satırda 2 harfli rozetin anlamı hiçbir yerde açıklanmıyordu).
          // Header metni artık "Teslim / Fatura" (Tur 5 P2 bulgusu): tek açıklama önceden yalnızca
          // header'daki `title` özniteliğiydi (yalnız hover ile açılır) — dokunmatik cihazda T/F'nin
          // anlamı hiç öğrenilemiyordu. Genişlik 64→104px.
          id: 'progress',
          header: 'Teslim / Fatura',
          enableSorting: false, meta: { width: 104, mobile: 'hidden' },
          cell: ({ row }) => (
            <div className="flex items-center gap-1">
              <ProgressDot pct={row.original.deliveredPct} label="T" />
              <ProgressDot pct={row.original.invoicedPct} label="F" />
            </div>
          ),
        },
        // width 140: ₺999.999,99 (10 karakter, tabular-nums) + sağ iç boşluk sığar — 110px'te son
        // hane sağdaki sabitlenmiş "Genel toplam" hücresinin opak zemininin altında kırpılıyordu.
        { id: 'netRevenue', accessorFn: (r) => r.netRevenue, header: 'Net ciro', meta: { align: 'right', width: 140 }, cell: ({ row }) => <MoneyCell value={row.original.netRevenue} currency={row.original.currency} /> },
      );
    }
    cols.push({
      // Kök neden analizi (Tur 2 P0): `position:sticky;right:0` son sütunu, tablo yalnızca birkaç
      // on piksel taştığında (tam da bu tabloda: ~47px taşma, 120px sütun genişliği) doğal akıştaki
      // ÖNCEKİ sütunun (Net ciro) üzerine BİNDİRİYORDU — sticky'nin "görünür kalsın" kenetlemesi
      // taşma miktarından bağımsız her zaman devreye giriyor, taşma sütun genişliğinden azsa iki
      // hücre aynı ekran alanını paylaşıyor (opak zemin altındakini gizliyor). Koşullu (meta.pinRight)
      // hale getirmek bunu düzeltmiyordu, yalnızca ne zaman göründüğünü değiştiriyordu — bu yüzden
      // sabitleme tamamen kaldırıldı: tablo artık `min-w-full` ile gerçekten yatay kayıyor (bkz.
      // data-table.tsx), Genel toplam da diğer sütunlar gibi normal akışta, kaydırınca görünür.
      id: 'grandTotal', accessorFn: (r) => r.grandTotal, header: 'Genel toplam',
      meta: { align: 'right', width: 120 },
      cell: ({ row }) => <MoneyCell value={row.original.grandTotal} currency={row.original.currency} />,
    });
    return cols;
  }, [docType]);

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('sales_order') },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `${basePath}/${r.id}`}
      searchPlaceholder="Belge no, cari, dış sipariş no ara…"
      filters={filters}
      initialSorting={[{ id: 'orderDate', desc: true }]}
      emptyTitle={docType === 'quotation' ? 'Henüz teklif yok' : 'Henüz sipariş yok'}
      emptyDescription={docType === 'quotation' ? 'Fırsatlar ekranından ya da doğrudan yeni teklif oluşturun.' : 'Onaylı bir teklifi siparişe dönüştürün ya da doğrudan yeni sipariş açın.'}
      renderMobileCard={(row) => <DocCard row={row} docType={docType} />}
    />
  );
}

'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime, formatPct, relativeTime } from '@/lib/format';
import { CHANNEL_KIND_LABELS, CHANNEL_SYNC_SUPPORTED } from '../labels';
import { ChannelSettingsDrawer } from './channel-settings-drawer';
import { ChannelSyncButton } from './channel-sync-button';
import type { ChannelCardRow } from '../queries';

// Önceki `MoneyOrDash` (sıfırı '—' ile basıyordu) kaldırıldı: em dash "bilinmiyor/uygulanamaz"
// anlamına gelir, "bugün satış yok" ise BİLİNEN bir sıfırdır — /satis/net-ciro tablosu aynı sıfırı
// soluk "₺0" olarak basıyordu, aynı veri iki ekranda iki farklı anlam taşıyordu (Tur 4 P2 bulgusu).
// `MoneyCell` zaten gerçek sıfırı kendi başına `text-muted-foreground/70` ile soluklaştırıyor —
// doğrudan kullanmak her iki ekranda da tek bir kural sağlıyor: '—' yalnızca null/undefined için.

export function ChannelsTable({ rows }: { rows: ChannelCardRow[] }) {
  const columns = useMemo<ColumnDef<ChannelCardRow, unknown>[]>(
    () => [
      {
        // Sabit `bg-primary` nokta: 7 satırın 7'sinde özdeş, hiçbir bilgi taşımıyordu (Tur 3 P2, saf
        // dekorasyon) — kaldırıldı. Gerçek durum bilgisi (aktif/pasif) zaten `isActive` üzerinden bir
        // yerde tutulmuyor; ileride eklenirse StatusBadge ile (renk = anlam) verilmeli, çıplak nokta değil.
        //
        // Tur 11 P2 satis-kanallar-03 (YENİDEN AÇILDI — Tur 10'un `flex:true` düzeltmesi kanıtlanmadan
        // kapatılmıştı). Kök neden #1: `meta.flex` yalnızca width'i OLMAYAN DİĞER sütunları `width:1%`'e
        // sıkıştırır (data-table.tsx `hasFlexColumn`); bu tabloda width'i olmayan tek sütun zaten
        // 'name'in KENDİSİYDİ, yani düzeltme kendi kendine hiçbir şey yapmadı. Kök neden #2 (ilk
        // düzeltme denemesinde ortaya çıktı): `width` TAMAMEN kaldırıp yalnızca içerik `span`ine
        // `max-w-[240px] truncate` vermek de yetmedi — auto table-layout, diğer 6 sütunun toplam
        // genişliği (660px) kapsayıcıdan (1152px) 492px küçük olduğu için TÜM boşluğu width'siz TEK
        // sütuna (Kanal) veriyor, span içeriği 240px'te kırpılsa bile TD 469px kalıyor (satır başına
        // ~229px ölü alan — ölçülen sayı BİREBİR aynı kaldı). Gerçek üst sınır hem TD'ye (`meta.width`)
        // hem içerik span'ine (`max-w-[…] truncate`, uzun adlarda hâlâ kırpma garantisi) verilmeli.
        id: 'name', accessorFn: (r) => r.channel.name, header: 'Kanal', meta: { width: 240, mobile: 'title', className: 'max-w-[240px] truncate' },
        cell: ({ row }) => <span className="block max-w-[240px] truncate font-medium" title={row.original.channel.name}>{row.original.channel.name}</span>,
      },
      {
        // mobile:'subtitle' (Tur 5 P2 bulgusu — önceden 'meta'): kanalın NE OLDUĞU (pazaryeri/site/
        // toptan) son senkron zamanından daha temel bir kimlik bilgisi, masaüstündeki 2. sütun konumuyla
        // aynı önceliği mobilde de taşımalı — mobil hiyerarşi artık masaüstüyle aynı dili konuşuyor.
        id: 'kind', accessorFn: (r) => CHANNEL_KIND_LABELS[r.channel.kind] ?? r.channel.kind, header: 'Tip',
        meta: { width: 130, mobile: 'subtitle', className: 'text-muted-foreground' },
      },
      {
        id: 'orderCount', accessorFn: (r) => r.orderCount, header: 'Sipariş (ay)', meta: { align: 'right', width: 100, mobile: 'hidden' },
        cell: ({ row }) => <span className={`num tabular-nums ${row.original.orderCount === 0 ? 'text-muted-foreground/70' : ''}`}>{row.original.orderCount}</span>,
      },
      {
        // Mobilde artık gizli değil (Tur 4 P2 bulgusu): komisyon oranı bu ekranın varlık sebebi,
        // önceden 5 masaüstü metriğinden 3'ü mobilde düşüyor, kart yalnızca "Bugün / Bu ay" gösterip
        // sıfır bilgi taşıyan bir metrik bölümüne dönüşüyordu — şimdi 3. dolu metrik olarak `rest`
        // ızgarasında görünür (todayRevenue + monthRevenue + commissionPct).
        id: 'commissionPct', accessorFn: (r) => r.channel.commissionPct, header: 'Komisyon', meta: { align: 'right', width: 90 },
        cell: ({ row }) => <span className="num tabular-nums text-muted-foreground">{formatPct(row.original.channel.commissionPct, 0)}</span>,
      },
      // "Bugün" sütunu kaldırıldı (Tur 5 P2 bulgusu): 7 satırın 7'sinde ₺0,00 basıp tablodaki en geniş
      // sütunu sıfır bilgiyle dolduruyordu — tek para sütunu "Bu ay" kalır.
      //
      // Tur 11 P1 satis-kanallar-05 (kök neden b): `mobile-cards.tsx`'in TEK metrik yuvası `rest`
      // dizisinin SONUNCUSUNU seçer (bkz. dosya üstü not) — `commissionPct` bu sütundan SONRA
      // tanımlandığı için (sabit komisyon oranı, hiç değişmeyen) kartın tek sayısı hep O oluyordu,
      // sayfanın asıl konusu olan "Bu ay" cirosu hiç görünmüyordu. Sıra artık ciro EN SONA gelecek
      // şekilde: commissionPct hâlâ `rest`'te (masaüstünde görünür, mobilde metrik yuvasını kaybeder —
      // "diğer rest alanları mobil kartta hiç gösterilmez" kuralı burada da geçerli) ama monthRevenue
      // artık son sıradaki gerçek metrik.
      { id: 'monthRevenue', header: 'Bu ay', meta: { align: 'right', width: 110 }, cell: ({ row }) => <MoneyCell value={row.original.monthRevenue} /> },
      {
        // mobile:'meta' (Tur 5 P2 bulgusu — önceden 'subtitle'): kanal TİPİ kimlik bilgisi olarak
        // kartın 2. satırına taşındı, son senkron zamanı etiketsiz tek satırlık "meta" konumuna iner —
        // masaüstünde de bu sütun listenin son sütunu, aynı düşük öncelik mobilde de korunur. Tam
        // tarih `title` tooltip'inde saklı.
        //
        // Tur 11 P1 satis-kanallar-05 (kök neden a): `accessorFn` YOKTU — sıralanamaz/filtrelenemez bir
        // sütun (`enableSorting` da yok) olduğu için gereksiz sanılmıştı, ama `mobile-cards.tsx`'in
        // `metaCells` filtresi `c.getValue()`'ya bakıyor ve accessorFn'siz bir sütunda bu her zaman
        // `undefined` döner — `isEmptyValue` bunu "veri yok" sayıp satırı sessizce atıyordu (7 kartın
        // 7'sinde de "son senkron" hiç görünmüyordu). accessorFn eklendi, sıralama/filtre davranışı
        // değişmedi (ikisi de zaten kapalıydı).
        id: 'lastSyncedAt', accessorFn: (r) => r.lastSyncedAt, header: 'Son senkron', meta: { width: 150, mobile: 'meta', className: 'text-xs text-muted-foreground' },
        cell: ({ row }) => {
          const { channel, lastSyncedAt, pendingErrors } = row.original;
          const syncSupported = CHANNEL_SYNC_SUPPORTED.has(channel.code);
          return (
            <span className="inline-flex items-center gap-1.5" title={lastSyncedAt ? formatDateTime(lastSyncedAt) : undefined}>
              {/* Tur 10 P1 satis-kanallar-01: amber "Henüz yapılmadı" senkron desteklemeyen kanalda
                  (Toptan/Fason, İhracat, Kendi Sitemiz…) asla gerçekleşmeyecek bir olayı işaretliyordu —
                  7 satırın 5'i amber basıyordu ama gerçek uyarı gereken satır 0'dı ("renk yalnızca
                  anlam taşır" ihlali). Senkron desteklenmeyen kanalda rozet yerine soluk düz metin;
                  amber yalnızca gerçekten senkronlanabilip HİÇ senkronlanmamış kanalda basılır. */}
              {lastSyncedAt ? (
                relativeTime(lastSyncedAt)
              ) : syncSupported ? (
                <StatusBadge status="pending" label="Henüz yapılmadı" tone="warning" size="sm" />
              ) : (
                <span className="text-muted-foreground/50">senkron yok</span>
              )}
              {pendingErrors > 0 ? <StatusBadge status="error" label={`${pendingErrors} hata`} tone="danger" /> : null}
            </span>
          );
        },
      },
      {
        // Linear satırında eylem yalnızca hover/focus'ta belirir — 7 satırın sağ 300px'inde sürekli
        // dolu buton kalıcı gürültüydü. Mobilde (kart, hover yok) her zaman görünür kalır.
        // mobile: 'badge' (row değil): kart başlığının sağına, rozetlerle aynı satıra taşınır — ayrı
        // bir "İşlem" tam satırı harcamaz (Tur 3 P1: 44px düğmeler + tam satır etiket, kart yüksekliğini
        // gereksiz büyütüyordu).
        id: 'actions', header: '', enableSorting: false, meta: { align: 'right', width: 80, mobile: 'badge', label: 'İşlem' },
        cell: ({ row }) => {
          const { channel } = row.original;
          const syncSupported = CHANNEL_SYNC_SUPPORTED.has(channel.code);
          return (
            // Tur 10 P1 satis-kanallar-02: `group-hover/row` Tailwind'in `hover` varyantı DEĞİL —
            // globals.css:10'daki (hover:hover) sarmalaması ona uygulanmaz, dokunmatik ≥768px
            // (tablet) cihazda düğmeler kalıcı görünmez ama pointer-events açık kalıyordu (görünmez
            // ama basılabilir kontrol — kanal ayarları drawer'ına ulaşmanın tek yolu buydu). Ortak
            // DataTableRowActions'taki (`row-actions.tsx:33`) `md:[@media(hover:none)]:opacity-100`
            // kaçışıyla birebir aynı kalıp eklendi.
            <span className="inline-flex items-center gap-1 opacity-100 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 md:opacity-0 md:[@media(hover:none)]:opacity-100">
              {syncSupported ? <ChannelSyncButton channelCode={channel.code as 'TRENDYOL' | 'HEPSIBURADA'} compact /> : null}
              <ChannelSettingsDrawer channel={channel} />
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
      data={rows}
      getRowId={(r) => r.channel.id}
      searchPlaceholder="Kanal ara…"
      emptyTitle="Henüz kanal tanımlı değil"
      emptyDescription="Satış seed'i çalıştırılmalı."
    />
  );
}

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
        id: 'name', accessorFn: (r) => r.channel.name, header: 'Kanal', meta: { mobile: 'title' },
        cell: ({ row }) => <span className="font-medium">{row.original.channel.name}</span>,
      },
      {
        // mobile:'subtitle' (Tur 5 P2 bulgusu — önceden 'meta'): kanalın NE OLDUĞU (pazaryeri/site/
        // toptan) son senkron zamanından daha temel bir kimlik bilgisi, masaüstündeki 2. sütun konumuyla
        // aynı önceliği mobilde de taşımalı — mobil hiyerarşi artık masaüstüyle aynı dili konuşuyor.
        id: 'kind', accessorFn: (r) => CHANNEL_KIND_LABELS[r.channel.kind] ?? r.channel.kind, header: 'Tip',
        meta: { width: 130, mobile: 'subtitle', className: 'text-muted-foreground' },
      },
      // "Bugün" sütunu kaldırıldı (Tur 5 P2 bulgusu): 7 satırın 7'sinde ₺0,00 basıp tablodaki en geniş
      // sütunu sıfır bilgiyle dolduruyordu — tek para sütunu "Bu ay" kalır.
      { id: 'monthRevenue', header: 'Bu ay', meta: { align: 'right', width: 110 }, cell: ({ row }) => <MoneyCell value={row.original.monthRevenue} /> },
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
      {
        // mobile:'meta' (Tur 5 P2 bulgusu — önceden 'subtitle'): kanal TİPİ kimlik bilgisi olarak
        // kartın 2. satırına taşındı, son senkron zamanı etiketsiz tek satırlık "meta" konumuna iner —
        // masaüstünde de bu sütun listenin son sütunu, aynı düşük öncelik mobilde de korunur. Tam
        // tarih `title` tooltip'inde saklı.
        id: 'lastSyncedAt', header: 'Son senkron', meta: { width: 150, mobile: 'meta', className: 'text-xs text-muted-foreground' },
        cell: ({ row }) => {
          const { lastSyncedAt, pendingErrors } = row.original;
          return (
            <span className="inline-flex items-center gap-1.5" title={lastSyncedAt ? formatDateTime(lastSyncedAt) : undefined}>
              {/* "Henüz yapılmadı" nötr griden ayrışan sessiz bir uyarı tonu taşır (Tur 5 P2 bulgusu) —
                  hiç senkronize olmamış bir kanal, "2 saat önce"den kalitatif olarak farklı bir durum. */}
              {lastSyncedAt ? relativeTime(lastSyncedAt) : <StatusBadge status="pending" label="Henüz yapılmadı" tone="warning" size="sm" />}
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
            <span className="inline-flex items-center gap-1 opacity-100 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 md:opacity-0">
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

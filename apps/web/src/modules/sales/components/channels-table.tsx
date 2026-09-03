'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { EmptyCell } from '@/components/empty-cell';
import { formatDateTime, formatPct } from '@/lib/format';
import { CHANNEL_KIND_LABELS, CHANNEL_SYNC_SUPPORTED } from '../labels';
import { ChannelSettingsDrawer } from './channel-settings-drawer';
import { ChannelSyncButton } from './channel-sync-button';
import type { ChannelCardRow } from '../queries';

/** Sıfır ciro/sipariş satırlarını '₺0,00' yerine soluk '—' gösterir — 28 hücrenin 25'i boşken
 * her satırda gerçek veriyi (Trendyol'un tek dolu hücresi gibi) göze çarpar kılar. */
function MoneyOrDash({ value, currency = 'TRY' }: { value: string | number; currency?: string }) {
  const zero = /^-?0*(\.0*)?$/.test(String(value).trim());
  if (zero) return <EmptyCell className="num inline-block text-right" />;
  return <MoneyCell value={value} currency={currency} />;
}

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
        id: 'kind', accessorFn: (r) => CHANNEL_KIND_LABELS[r.channel.kind] ?? r.channel.kind, header: 'Tip',
        meta: { width: 130, mobile: 'meta', className: 'text-muted-foreground' },
      },
      { id: 'todayRevenue', header: 'Bugün', meta: { align: 'right', width: 110 }, cell: ({ row }) => <MoneyOrDash value={row.original.todayRevenue} /> },
      { id: 'monthRevenue', header: 'Bu ay', meta: { align: 'right', width: 110, mobile: 'row' }, cell: ({ row }) => <MoneyOrDash value={row.original.monthRevenue} /> },
      {
        id: 'orderCount', accessorFn: (r) => r.orderCount, header: 'Sipariş (ay)', meta: { align: 'right', width: 100, mobile: 'hidden' },
        cell: ({ row }) => row.original.orderCount > 0 ? <span className="num tabular-nums">{row.original.orderCount}</span> : <EmptyCell className="num" />,
      },
      {
        id: 'commissionPct', accessorFn: (r) => r.channel.commissionPct, header: 'Komisyon', meta: { align: 'right', width: 90, mobile: 'hidden' },
        cell: ({ row }) => <span className="num tabular-nums text-muted-foreground">{formatPct(row.original.channel.commissionPct, 0)}</span>,
      },
      {
        id: 'lastSyncedAt', header: 'Son senkron', meta: { width: 150, mobile: 'hidden', className: 'text-xs text-muted-foreground' },
        cell: ({ row }) => {
          const { lastSyncedAt, pendingErrors } = row.original;
          return (
            <span className="inline-flex items-center gap-1.5">
              {lastSyncedAt ? formatDateTime(lastSyncedAt) : 'Henüz yapılmadı'}
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

import { Store, ShoppingBag, Globe2, Landmark, Wheat, Laptop } from 'lucide-react';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime, formatPct } from '@/lib/format';
import { CHANNEL_KIND_LABELS, CHANNEL_SYNC_SUPPORTED } from '../labels';
import { ChannelSettingsDrawer } from './channel-settings-drawer';
import { ChannelSyncButton } from './channel-sync-button';
import type { ChannelCardRow } from '../queries';

const KIND_ICON: Record<string, typeof Store> = {
  marketplace: ShoppingBag, own_site: Laptop, wholesale: Store, retail_chain: Store, export: Globe2, raw_material: Wheat,
};

export function ChannelCard({ row }: { row: ChannelCardRow }) {
  const { channel } = row;
  const Icon = KIND_ICON[channel.kind] ?? Landmark;
  const syncSupported = CHANNEL_SYNC_SUPPORTED.has(channel.code);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4.5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{channel.name}</div>
            <div className="text-xs text-muted-foreground">{CHANNEL_KIND_LABELS[channel.kind] ?? channel.kind}</div>
          </div>
        </div>
        <ChannelSettingsDrawer channel={channel} />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
        <div>
          <div className="text-[11px] text-muted-foreground">Bugün</div>
          <MoneyCell value={row.todayRevenue} className="text-[15px] font-semibold" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Bu ay</div>
          <MoneyCell value={row.monthRevenue} className="text-[15px] font-semibold" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Sipariş (ay)</div>
          <div className="num text-[15px] font-semibold">{row.orderCount}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Komisyon</div>
          <div className="num text-[15px] font-semibold">{formatPct(channel.commissionPct, 0)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
        <div className="min-w-0">
          {row.lastSyncedAt ? (
            <span className="text-muted-foreground">Son senkron: {formatDateTime(row.lastSyncedAt)}</span>
          ) : (
            <span className="text-muted-foreground">Henüz senkron yapılmadı</span>
          )}
          {row.pendingErrors > 0 ? (
            <div className="mt-1">
              <StatusBadge status="error" label={`${row.pendingErrors} hata`} tone="danger" />
            </div>
          ) : null}
        </div>
        {syncSupported ? <ChannelSyncButton channelCode={channel.code as 'TRENDYOL' | 'HEPSIBURADA'} /> : null}
      </div>
    </div>
  );
}

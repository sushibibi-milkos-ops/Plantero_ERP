import { eq, max } from 'drizzle-orm';
import { channelOrders, db, salesChannels } from '@plantero/db';
import { hepsiburada, trendyol, type MarketplaceProvider } from '@plantero/integrations';

const PROVIDERS: MarketplaceProvider[] = [trendyol, hepsiburada];

/**
 * Pazaryeri senkronu: aktif kanallar için son senkrondan bu yana gelen siparişleri çeker
 * ve `channel_orders`'a yazar (idempotent — externalId üzerinden). Sipariş → satış siparişi
 * dönüşümü satış modülünün onay akışında yapılır (bu iş yalnızca ham veriyi indirir).
 */
export async function runMarketplaceSync(): Promise<Record<string, unknown>> {
  let totalFetched = 0;
  let totalInserted = 0;
  const perChannel: Record<string, { fetched: number; inserted: number; mode: string }> = {};

  for (const provider of PROVIDERS) {
    const [channel] = await db.select().from(salesChannels).where(eq(salesChannels.code, provider.channelCode)).limit(1);
    if (!channel || !channel.syncEnabled) {
      perChannel[provider.channelCode] = { fetched: 0, inserted: 0, mode: provider.mode };
      continue;
    }

    const [lastRow] = await db.select({ lastOrder: max(channelOrders.orderedAt) }).from(channelOrders).where(eq(channelOrders.channelId, channel.id));
    const since = lastRow?.lastOrder ? new Date(lastRow.lastOrder) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orders = await provider.fetchOrders(since);
    totalFetched += orders.length;

    let inserted = 0;
    for (const o of orders) {
      const res = await db
        .insert(channelOrders)
        .values({
          channelId: channel.id,
          externalId: o.externalId,
          externalStatus: o.externalStatus,
          orderedAt: new Date(o.orderedAt),
          customerName: o.customerName,
          customerEmail: o.customerEmail,
          customerPhone: o.customerPhone,
          grossAmount: o.grossAmount,
          commissionAmount: o.commissionAmount,
          shippingAmount: o.shippingAmount,
          netAmount: o.netAmount,
          currency: o.currency,
          lines: o.lines,
          raw: o.raw,
          syncStatus: 'new',
        })
        .onConflictDoNothing({ target: [channelOrders.channelId, channelOrders.externalId] })
        .returning({ id: channelOrders.id });
      if (res.length > 0) inserted++;
    }

    totalInserted += inserted;
    perChannel[provider.channelCode] = { fetched: orders.length, inserted, mode: provider.mode };
  }

  return { fetched: totalFetched, inserted: totalInserted, perChannel, note: 'channel_orders → sales_orders dönüşümü satış modülünün onay akışında yapılır.' };
}

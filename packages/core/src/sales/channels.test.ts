import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { salesChannels, partners, products, channelOrders, type Tx } from '@plantero/db';
import { ingestChannelOrders, getChannelRevenue, type ChannelOrderInput } from './channels.js';
import { withRollback, seedBase, ctx, today, type Base } from '../__tests__/helpers.js';

async function seedChannelWithPartner(tx: Tx, b: Base) {
  const [channel] = await tx.insert(salesChannels).values({ code: `MKT-${b.s}`, name: `Pazaryeri ${b.s}`, kind: 'marketplace', commissionPct: '20' }).returning();
  await tx.update(partners).set({ defaultChannelId: channel!.id }).where(eq(partners.id, b.customer.id));
  await tx.update(products).set({ barcode: `BC-${b.s}` }).where(eq(products.id, b.finished.id));
  return channel!;
}

function order(externalId: string, barcode: string): ChannelOrderInput {
  return {
    externalId, orderedAt: `${today()}T10:00:00.000Z`, externalStatus: 'Delivered', customerName: 'Test Müşteri',
    grossAmount: '100.0000', commissionAmount: '20.0000', shippingAmount: '0.0000', netAmount: '80.0000', currency: 'TRY',
    lines: [{ barcode, productName: 'Ürün', qty: '2', unitPrice: '50.0000' }],
  };
}

describe('sales/channels', () => {
  it('barkod eşleşirse sipariş oluşturulup otomatik onaylanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedChannelWithPartner(tx, b);

      const res = await ingestChannelOrders(tx, channel.id, [order('TY-001', `BC-${b.s}`)], ctx);
      expect(res).toMatchObject({ fetched: 1, converted: 1, errors: 0 });
      expect(res.createdOrders).toHaveLength(1);

      const [co] = await tx.select().from(channelOrders).where(eq(channelOrders.channelId, channel.id));
      expect(co!.syncStatus).toBe('converted');
      expect(co!.salesOrderId).toBeTruthy();

      // İkinci kez çağrıldığında (senkron döngüsü) zaten dönüştürülmüş siparişe tekrar dokunmaz
      const again = await ingestChannelOrders(tx, channel.id, [order('TY-001', `BC-${b.s}`)], ctx);
      expect(again).toMatchObject({ fetched: 1, converted: 0, errors: 0 });
    });
  });

  it('eşleşmeyen barkod sync_status=error yapar, sipariş oluşturmaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedChannelWithPartner(tx, b);

      const res = await ingestChannelOrders(tx, channel.id, [order('TY-002', 'BILINMEYEN-BARKOD')], ctx);
      expect(res).toMatchObject({ fetched: 1, converted: 0, errors: 1 });
      const [co] = await tx.select().from(channelOrders).where(eq(channelOrders.channelId, channel.id));
      expect(co!.syncStatus).toBe('error');
      expect(co!.syncError).toMatch(/Barkod eşleşmedi/);
      expect(co!.salesOrderId).toBeNull();
    });
  });

  it('getChannelRevenue confirmed+ siparişleri kanal bazında toplar', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const channel = await seedChannelWithPartner(tx, b);
      await ingestChannelOrders(tx, channel.id, [order('TY-003', `BC-${b.s}`)], ctx);

      const rows = await getChannelRevenue(tx, { from: today(), to: today() });
      const row = rows.find((r) => r.channelId === channel.id)!;
      expect(row.orderCount).toBe(1);
      expect(row.subtotal.toFixed(2)).toBe('100.00'); // 2×50
    });
  });
});

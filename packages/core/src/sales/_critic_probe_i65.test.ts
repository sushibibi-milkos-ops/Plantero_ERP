import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { salesChannels, partners, products, channelOrders, salesOrders, type Tx } from '@plantero/db';
import { ingestChannelOrders, type ChannelOrderInput } from './channels.js';
import { withRollback, seedBase, ctx, today, type Base } from '../__tests__/helpers.js';

async function seedChannelWithPartner(tx: Tx, b: Base, commissionPct: string) {
  const [channel] = await tx.insert(salesChannels).values({ code: `MKT-${b.s}`, name: `Pazaryeri ${b.s}`, kind: 'marketplace', commissionPct }).returning();
  await tx.update(partners).set({ defaultChannelId: channel!.id }).where(eq(partners.id, b.customer.id));
  await tx.update(products).set({ barcode: `BC-${b.s}` }).where(eq(products.id, b.finished.id));
  return channel!;
}

describe('CRITIC PROBE I65 — channel_orders.commissionAmount (gerçek pazaryeri feed) vs sales_orders.commissionAmount (yeniden hesaplanan)', () => {
  it('KANIT: marketplace gerçek komisyonu channel.commissionPct değerinden farklıysa, sales_orders sessizce YENİDEN HESAPLANMIŞ (yanlış) komisyonu kaydeder — raw feed atılır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // Sistemdeki kanal ayarı: %20 komisyon (kullanıcı ayarlar ekranından girmiş / varsayılan).
      const channel = await seedChannelWithPartner(tx, b, '20');

      // Canlı modda gerçek pazaryeri API'si (packages/integrations/src/marketplace/trendyol.ts:
      // `const commission = Number(raw.commissionAmount ?? 0)`) bu siparişte GERÇEKTE %35 komisyon
      // uyguladığını bildiriyor (kategoriye özel/kampanyalı oran — sistemdeki statik %20'den farklı,
      // tamamen gerçekçi bir senaryo). subtotal = 2*100 = 200; gerçek komisyon = 200*0.35 = 70.
      const input: ChannelOrderInput = {
        externalId: `PROBE-I65-${b.s}`, orderedAt: `${today()}T10:00:00.000Z`, externalStatus: 'Delivered', customerName: 'Test Müşteri',
        grossAmount: '200.0000', commissionAmount: '70.0000', shippingAmount: '0.0000', netAmount: '130.0000', currency: 'TRY',
        lines: [{ barcode: `BC-${b.s}`, productName: 'Ürün', qty: '2', unitPrice: '100.0000' }],
      };

      const res = await ingestChannelOrders(tx, channel.id, [input], ctx);
      expect(res).toMatchObject({ fetched: 1, converted: 1, errors: 0 });

      const [co] = await tx.select().from(channelOrders).where(eq(channelOrders.externalId, input.externalId));
      expect(co!.syncStatus).toBe('converted');
      expect(co!.commissionAmount).toBe('70.0000'); // marketplace'in GERÇEK raporu — değişmeden saklanıyor

      const [so] = await tx.select().from(salesOrders).where(eq(salesOrders.id, co!.salesOrderId!));
      console.log('KANIT: channel_orders.commissionAmount (gerçek, marketplace raporu) =', co!.commissionAmount,
        '  sales_orders.commissionAmount (sistemin channel.commissionPct=%20 ile YENİDEN HESAPLADIĞI) =', so!.commissionAmount,
        '  netRevenue (sistem) =', so!.netRevenue, ' vs gerçek netAmount (marketplace) =', co!.netAmount);

      // Sistem, marketplace'in bildirdiği gerçek komisyonu YOK SAYIYOR ve kendi %20 ayarıyla yeniden
      // hesaplıyor: 200*0.20 = 40.0000 (70.0000 DEĞİL). Bu, gerçek parayla (marketplace'in ödeyeceği
      // net tutar) sistemdeki "net ciro" KPI'sının kalıcı olarak uyuşmadığını KANITLAR.
      expect(so!.commissionAmount).toBe('40.0000');
      expect(so!.commissionAmount).not.toBe(co!.commissionAmount);
      expect(so!.netRevenue).not.toBe(co!.netAmount);
      expect(so!.netRevenue).toBe('160.0000'); // sistemin (yanlış) hesabı: 200-40
      expect(co!.netAmount).toBe('130.0000'); // marketplace'in gerçek ödeyeceği (200-70)

      // I65 aday SQL'i bu canlı transaction snapshot'ında koşup 1 satır ihlal görmeli.
      const violation = (await tx.execute(
        `SELECT co.id FROM channel_orders co JOIN sales_orders so ON so.id = co.sales_order_id
         WHERE co.id = '${co!.id}' AND abs((so.commission_amount)::numeric - (co.commission_amount)::numeric) > 0`,
      )) as unknown as unknown[];
      expect(violation.length).toBe(1);
    });
  });
});

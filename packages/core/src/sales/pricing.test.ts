import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { customerPrices, priceLists, priceListItems, salesChannels, exchangeRates, products, type Tx } from '@plantero/db';
import { resolvePrice, computeLineTotals, computeChannelDeductions, getExchangeRate } from './pricing.js';
import { withRollback, seedBase, d, today, type Base } from '../__tests__/helpers.js';

async function seedPriceList(tx: Tx, b: Base, price: string, includesVat = false) {
  const [list] = await tx.insert(priceLists).values({ code: `PL-${b.s}`, name: `Liste ${b.s}`, currency: 'TRY', includesVat }).returning();
  await tx.insert(priceListItems).values({ priceListId: list!.id, productId: b.finished.id, minQty: '0', price });
  return list!;
}

describe('sales/pricing — resolvePrice', () => {
  it('öncelik: müşteri özel fiyat > fiyat listesi > ürün liste fiyatı', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // Yalnızca ürün liste fiyatı
      await tx.update(products).set({ listPrice: '100.0000' }).where(eq(products.id, b.finished.id));
      const onlyList = await resolvePrice(tx, { productId: b.finished.id, partnerId: b.customer.id, qty: d(1) });
      expect(onlyList.source).toBe('list');
      expect(onlyList.unitPrice.toFixed(2)).toBe('100.00');

      // Fiyat listesi eklenince onu kullanmalı
      const list = await seedPriceList(tx, b, '120.0000');
      const withList = await resolvePrice(tx, { productId: b.finished.id, partnerId: b.customer.id, priceListId: list.id, qty: d(1) });
      expect(withList.source).toBe('list');
      expect(withList.unitPrice.toFixed(2)).toBe('120.00');

      // Kanal fiyat listesiyse kaynak 'channel'
      const [channel] = await tx.insert(salesChannels).values({ code: `CH-${b.s}`, name: `Kanal ${b.s}`, kind: 'marketplace' }).returning();
      await tx.update(priceLists).set({ channelId: channel!.id }).where(eq(priceLists.id, list.id));
      const viaChannel = await resolvePrice(tx, { productId: b.finished.id, partnerId: b.customer.id, priceListId: list.id, qty: d(1) });
      expect(viaChannel.source).toBe('channel');

      // Müşteri özel fiyat her şeyi ezer
      await tx.insert(customerPrices).values({ partnerId: b.customer.id, productId: b.finished.id, minQty: '0', price: '90.0000', currency: 'TRY' });
      const withCustomer = await resolvePrice(tx, { productId: b.finished.id, partnerId: b.customer.id, priceListId: list.id, qty: d(1) });
      expect(withCustomer.source).toBe('customer');
      expect(withCustomer.unitPrice.toFixed(2)).toBe('90.00');
    });
  });

  it('KDV dahil fiyat listesinde net fiyat (KDV hariç) döner', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // b.finished vatRate varsayılan '1' (gıda %1)
      const list = await seedPriceList(tx, b, '101.0000', true);
      const resolved = await resolvePrice(tx, { productId: b.finished.id, partnerId: b.customer.id, priceListId: list.id, qty: d(1) });
      // 101 / 1.01 = 100
      expect(resolved.unitPrice.toFixed(2)).toBe('100.00');
    });
  });

  it('minQty eşiğine göre en uygun kademe seçilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const [list] = await tx.insert(priceLists).values({ code: `PLQ-${b.s}`, name: `Kademeli ${b.s}`, currency: 'TRY' }).returning();
      await tx.insert(priceListItems).values([
        { priceListId: list!.id, productId: b.finished.id, minQty: '0', price: '100.0000' },
        { priceListId: list!.id, productId: b.finished.id, minQty: '50', price: '90.0000' },
      ]);
      const small = await resolvePrice(tx, { productId: b.finished.id, partnerId: b.customer.id, priceListId: list!.id, qty: d(10) });
      expect(small.unitPrice.toFixed(2)).toBe('100.00');
      const big = await resolvePrice(tx, { productId: b.finished.id, partnerId: b.customer.id, priceListId: list!.id, qty: d(60) });
      expect(big.unitPrice.toFixed(2)).toBe('90.00');
    });
  });
});

describe('sales/pricing — computeLineTotals', () => {
  it('iskonto ve KDV doğru sırayla uygulanır', () => {
    const totals = computeLineTotals({ qty: d(10), unitPrice: d(100), discountPct: d(10), vatRate: d(1) });
    // 10*100=1000, %10 iskonto=100 → 900 ara toplam, %1 KDV=9 → 909 genel toplam
    expect(totals.discountAmount.toFixed(2)).toBe('100.00');
    expect(totals.lineSubtotal.toFixed(2)).toBe('900.00');
    expect(totals.lineVat.toFixed(2)).toBe('9.00');
    expect(totals.lineTotal.toFixed(2)).toBe('909.00');
  });
});

describe('sales/pricing — computeChannelDeductions', () => {
  it('komisyon + sabit kargo + diğer % → net ciro', () => {
    const ded = computeChannelDeductions(d(1000), { commissionPct: '21', shippingDeductionPerOrder: '45', otherDeductionPct: '0' });
    expect(ded.commissionAmount.toFixed(2)).toBe('210.00');
    expect(ded.shippingDeduction.toFixed(2)).toBe('45.00');
    expect(ded.netRevenue.toFixed(2)).toBe('745.00');
  });
});

describe('sales/pricing — getExchangeRate', () => {
  it('TRY her zaman 1 döner; döviz için en yakın geçmiş kur seçilir', async () => {
    await withRollback(async (tx) => {
      // GBP: gerçek seed hiçbir yerde kullanmıyor — paylaşılan geliştirme veritabanında önceden
      // kayıt olmadığından test izole kalır (EUR gerçek seed'de dolu olabilir).
      expect((await getExchangeRate(tx, 'TRY', today()))!.toFixed(2)).toBe('1.00');
      expect(await getExchangeRate(tx, 'GBP', today())).toBeNull();
      await tx.insert(exchangeRates).values({ currency: 'GBP', rateDate: '2020-01-01', buying: '30.000000', selling: '30.500000' });
      const rate = await getExchangeRate(tx, 'GBP', today());
      expect(rate!.toFixed(2)).toBe('30.00');
    });
  });
});

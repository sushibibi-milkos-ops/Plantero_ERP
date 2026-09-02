import { and, eq, isNotNull } from 'drizzle-orm';
import { db, products, salesChannels } from '@plantero/db';
import { D, round2, toDb, ZERO } from '@plantero/core';
import { isoDate, seededRandom, startOfUtcDay } from '../lib/prng.js';
import type {
  IntegrationMode,
  MarketplaceOrder,
  MarketplaceOrderLine,
  MarketplaceProvider,
  MarketplaceSettlement,
  SettlementPeriod,
  StockUpdateItem,
} from '../types.js';

/** Sandbox sipariş üretiminde kullanılan deterministik Türkçe isim havuzu */
const CUSTOMER_NAMES = [
  'Ayşe Yılmaz', 'Mehmet Demir', 'Zeynep Kaya', 'Ali Çelik', 'Fatma Şahin',
  'Ahmet Yıldız', 'Elif Arslan', 'Mustafa Doğan', 'Hatice Aydın', 'Emre Kurt',
  'Selin Aksoy', 'Burak Öztürk', 'Merve Koç', 'Can Şimşek', 'Gamze Erdoğan',
];

const MAX_SANDBOX_DAYS = 30;

async function loadChannel(channelCode: 'TRENDYOL' | 'HEPSIBURADA') {
  const [channel] = await db.select().from(salesChannels).where(eq(salesChannels.code, channelCode)).limit(1);
  return channel;
}

async function loadCatalog() {
  return db
    .select({ id: products.id, barcode: products.barcode, sku: products.sku, name: products.name, listPrice: products.listPrice })
    .from(products)
    .where(and(eq(products.isSellable, true), isNotNull(products.barcode)));
}

async function sandboxFetchOrders(channelCode: 'TRENDYOL' | 'HEPSIBURADA', since: Date): Promise<MarketplaceOrder[]> {
  const [channel, catalog] = await Promise.all([loadChannel(channelCode), loadCatalog()]);
  if (catalog.length === 0) return [];

  const commissionPct = D(channel?.commissionPct ?? '15');
  const shippingDeduction = D(channel?.shippingDeductionPerOrder ?? '0');
  const otherDeductionPct = D(channel?.otherDeductionPct ?? '0');

  const prefix = channelCode === 'TRENDYOL' ? 'TY' : 'HB';
  const startDay = startOfUtcDay(since);
  const endDay = startOfUtcDay(new Date());
  const orders: MarketplaceOrder[] = [];

  for (let d = new Date(startDay), dayIdx = 0; d <= endDay && dayIdx < MAX_SANDBOX_DAYS; d.setUTCDate(d.getUTCDate() + 1), dayIdx++) {
    const dateStr = isoDate(d);
    const rnd = seededRandom(`${channelCode}-${dateStr}`);
    const orderCount = 5 + Math.floor(rnd() * 11); // günde 5-15 sipariş

    for (let i = 0; i < orderCount; i++) {
      const lineCount = 1 + Math.floor(rnd() * 3);
      const lines: MarketplaceOrderLine[] = [];
      let gross = ZERO;

      for (let li = 0; li < lineCount; li++) {
        const product = catalog[Math.floor(rnd() * catalog.length)]!;
        const qty = 1 + Math.floor(rnd() * 4);
        const basePrice = D(product.listPrice).gt(0) ? D(product.listPrice) : D(20 + Math.floor(rnd() * 200));
        const unitPrice = round2(basePrice.mul(1 + (rnd() - 0.5) * 0.1));
        const lineTotal = round2(unitPrice.mul(qty));
        gross = gross.plus(lineTotal);
        lines.push({ barcode: product.barcode!, sku: product.sku, productName: product.name, qty: String(qty), unitPrice: toDb(unitPrice) });
      }

      const commission = round2(gross.mul(commissionPct).div(100));
      const other = round2(gross.mul(otherDeductionPct).div(100));
      const net = gross.minus(commission).minus(shippingDeduction).minus(other);
      const hour = 8 + Math.floor(rnd() * 12);
      const minute = Math.floor(rnd() * 60);
      const customerName = CUSTOMER_NAMES[Math.floor(rnd() * CUSTOMER_NAMES.length)]!;

      orders.push({
        externalId: `${prefix}-${dateStr.replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`,
        orderedAt: `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`,
        externalStatus: 'Delivered',
        customerName,
        grossAmount: toDb(gross),
        commissionAmount: toDb(commission),
        shippingAmount: toDb(shippingDeduction),
        netAmount: toDb(net),
        currency: 'TRY',
        lines,
        raw: { sandbox: true, channelCode },
      });
    }
  }

  return orders;
}

async function sandboxFetchSettlements(channelCode: 'TRENDYOL' | 'HEPSIBURADA', period: SettlementPeriod): Promise<MarketplaceSettlement[]> {
  const channel = await loadChannel(channelCode);
  const rnd = seededRandom(`${channelCode}-settlement-${period.periodStart}-${period.periodEnd}`);
  const gross = D(80000 + Math.floor(rnd() * 120000));
  const commissionPct = D(channel?.commissionPct ?? '15');
  const otherDeductionPct = D(channel?.otherDeductionPct ?? '0');
  const commissions = round2(gross.mul(commissionPct).div(100));
  const shippingDeductions = round2(D(channel?.shippingDeductionPerOrder ?? '0').mul(5 + Math.floor(rnd() * 40)));
  const otherDeductions = round2(gross.mul(otherDeductionPct).div(100));
  const returns = round2(gross.mul(0.01 + rnd() * 0.02));
  const netPayout = gross.minus(commissions).minus(shippingDeductions).minus(otherDeductions).minus(returns);
  const settlementDays = channel?.settlementDays ?? 21;
  const expectedPayoutDate = isoDate(new Date(new Date(period.periodEnd).getTime() + settlementDays * 86400000));

  return [
    {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      grossSales: toDb(gross),
      commissions: toDb(commissions),
      shippingDeductions: toDb(shippingDeductions),
      otherDeductions: toDb(otherDeductions),
      returns: toDb(returns),
      netPayout: toDb(netPayout),
      expectedPayoutDate,
    },
  ];
}

export function createMarketplaceProvider(cfg: {
  channelCode: 'TRENDYOL' | 'HEPSIBURADA';
  liveEnvVars: string[];
  liveFetchOrders: (since: Date) => Promise<MarketplaceOrder[]>;
  liveUpdateStock: (items: StockUpdateItem[]) => Promise<{ ok: boolean; updated: number; sandbox: boolean }>;
  liveFetchSettlements: (period: SettlementPeriod) => Promise<MarketplaceSettlement[]>;
}): MarketplaceProvider {
  const computeMode = (): IntegrationMode => (cfg.liveEnvVars.every((k) => !!process.env[k]) ? 'live' : 'sandbox');

  return {
    get mode() {
      return computeMode();
    },
    channelCode: cfg.channelCode,
    fetchOrders: (since) => (computeMode() === 'sandbox' ? sandboxFetchOrders(cfg.channelCode, since) : cfg.liveFetchOrders(since)),
    updateStock: (items) =>
      computeMode() === 'sandbox' ? Promise.resolve({ ok: true, updated: items.length, sandbox: true }) : cfg.liveUpdateStock(items),
    fetchSettlements: (period) =>
      computeMode() === 'sandbox' ? sandboxFetchSettlements(cfg.channelCode, period) : cfg.liveFetchSettlements(period),
  };
}

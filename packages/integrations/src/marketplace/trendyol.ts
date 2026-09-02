import { createMarketplaceProvider } from './shared.js';
import type { MarketplaceOrder, MarketplaceOrderLine, MarketplaceSettlement, SettlementPeriod, StockUpdateItem } from '../types.js';

/**
 * Trendyol Marketplace API adaptörü.
 * `TRENDYOL_SUPPLIER_ID` + `TRENDYOL_API_KEY` + `TRENDYOL_API_SECRET` env'de yoksa sandbox.
 * Not: canlı uçlar Trendyol Entegrasyon API dokümantasyonuna göredir; gerçek kimlik bilgisiyle
 * doğrulanmadan üretime alınmamalıdır.
 */

const LIVE_ENV_VARS = ['TRENDYOL_SUPPLIER_ID', 'TRENDYOL_API_KEY', 'TRENDYOL_API_SECRET'];

function authHeader(): string {
  return `Basic ${Buffer.from(`${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`).toString('base64')}`;
}

function mapOrder(raw: Record<string, unknown>): MarketplaceOrder {
  const lines: MarketplaceOrderLine[] = ((raw.lines as Array<Record<string, unknown>>) ?? []).map((l) => ({
    barcode: String(l.barcode ?? ''),
    sku: l.merchantSku ? String(l.merchantSku) : undefined,
    productName: String(l.productName ?? ''),
    qty: String(l.quantity ?? '0'),
    unitPrice: String(l.price ?? '0'),
  }));
  const gross = Number(raw.grossAmount ?? raw.totalPrice ?? 0);
  const commission = Number(raw.commissionAmount ?? 0);
  const shipping = Number(raw.shippingAmount ?? 0);
  return {
    externalId: String(raw.orderNumber ?? raw.id ?? ''),
    orderedAt: new Date(Number(raw.orderDate ?? Date.now())).toISOString(),
    externalStatus: String(raw.status ?? 'Created'),
    customerName: raw.customerFirstName ? `${raw.customerFirstName} ${raw.customerLastName ?? ''}`.trim() : undefined,
    grossAmount: gross.toFixed(4),
    commissionAmount: commission.toFixed(4),
    shippingAmount: shipping.toFixed(4),
    netAmount: (gross - commission - shipping).toFixed(4),
    currency: 'TRY',
    lines,
    raw,
  };
}

async function liveFetchOrders(since: Date): Promise<MarketplaceOrder[]> {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID;
  const url = `https://api.trendyol.com/sapigw/suppliers/${supplierId}/orders?startDate=${since.getTime()}&orderByField=PackageLastModifiedDate&orderByDirection=DESC`;
  const res = await fetch(url, { headers: { Authorization: authHeader(), 'User-Agent': `${supplierId} - PlanteroERP` } });
  if (!res.ok) throw new Error(`Trendyol sipariş alınamadı: HTTP ${res.status}`);
  const data = (await res.json()) as { content?: Array<Record<string, unknown>> };
  return (data.content ?? []).map(mapOrder);
}

async function liveUpdateStock(items: StockUpdateItem[]): Promise<{ ok: boolean; updated: number; sandbox: boolean }> {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID;
  const url = `https://api.trendyol.com/sapigw/suppliers/${supplierId}/products/price-and-inventory`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items.map((i) => ({ barcode: i.barcode, quantity: Number(i.qty) })) }),
  });
  return { ok: res.ok, updated: res.ok ? items.length : 0, sandbox: false };
}

async function liveFetchSettlements(period: SettlementPeriod): Promise<MarketplaceSettlement[]> {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID;
  const url = `https://api.trendyol.com/sapigw/suppliers/${supplierId}/settlements?startDate=${period.periodStart}&endDate=${period.periodEnd}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`Trendyol hakediş alınamadı: HTTP ${res.status}`);
  const data = (await res.json()) as { content?: Array<Record<string, unknown>> };
  return (data.content ?? []).map((s) => ({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    grossSales: String(s.grossAmount ?? '0'),
    commissions: String(s.commissionAmount ?? '0'),
    shippingDeductions: String(s.shippingAmount ?? '0'),
    otherDeductions: '0',
    returns: String(s.returnAmount ?? '0'),
    netPayout: String(s.netAmount ?? '0'),
    expectedPayoutDate: String(s.payoutDate ?? period.periodEnd),
  }));
}

export const trendyol = createMarketplaceProvider({
  channelCode: 'TRENDYOL',
  liveEnvVars: LIVE_ENV_VARS,
  liveFetchOrders,
  liveUpdateStock,
  liveFetchSettlements,
});

import { createMarketplaceProvider } from './shared.js';
import type { MarketplaceOrder, MarketplaceOrderLine, MarketplaceSettlement, SettlementPeriod, StockUpdateItem } from '../types.js';

/**
 * Hepsiburada Marketplace API adaptörü.
 * `HEPSIBURADA_MERCHANT_ID` + `HEPSIBURADA_API_KEY` env'de yoksa sandbox.
 * Not: canlı uçlar Hepsiburada Merchant API dokümantasyonuna göredir; gerçek kimlik bilgisiyle
 * doğrulanmadan üretime alınmamalıdır.
 */

const LIVE_ENV_VARS = ['HEPSIBURADA_MERCHANT_ID', 'HEPSIBURADA_API_KEY'];

function authHeader(): string {
  return `Basic ${Buffer.from(`${process.env.HEPSIBURADA_MERCHANT_ID}:${process.env.HEPSIBURADA_API_KEY}`).toString('base64')}`;
}

function mapOrder(raw: Record<string, unknown>): MarketplaceOrder {
  const lines: MarketplaceOrderLine[] = ((raw.items as Array<Record<string, unknown>>) ?? []).map((l) => ({
    barcode: String(l.merchantSku ?? l.sku ?? ''),
    sku: l.sku ? String(l.sku) : undefined,
    productName: String(l.productName ?? l.name ?? ''),
    qty: String(l.quantity ?? '0'),
    unitPrice: String(l.unitPrice ?? l.price ?? '0'),
  }));
  const gross = Number(raw.totalPrice ?? 0);
  const commission = Number(raw.commissionAmount ?? 0);
  const shipping = Number(raw.cargoAmount ?? 0);
  return {
    externalId: String(raw.orderNumber ?? raw.id ?? ''),
    orderedAt: String(raw.orderDate ?? new Date().toISOString()),
    externalStatus: String(raw.status ?? 'Open'),
    customerName: raw.customerName ? String(raw.customerName) : undefined,
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
  const merchantId = process.env.HEPSIBURADA_MERCHANT_ID;
  const url = `https://oms-external.hepsiburada.com/orders/merchantid/${merchantId}?beginDate=${since.toISOString()}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`Hepsiburada sipariş alınamadı: HTTP ${res.status}`);
  const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
  return (data.items ?? []).map(mapOrder);
}

async function liveUpdateStock(items: StockUpdateItem[]): Promise<{ ok: boolean; updated: number; sandbox: boolean }> {
  const merchantId = process.env.HEPSIBURADA_MERCHANT_ID;
  const url = `https://listing-external.hepsiburada.com/listings/merchantid/${merchantId}/stock-uploads`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(items.map((i) => ({ merchantSku: i.barcode, availableStock: Number(i.qty) }))),
  });
  return { ok: res.ok, updated: res.ok ? items.length : 0, sandbox: false };
}

async function liveFetchSettlements(period: SettlementPeriod): Promise<MarketplaceSettlement[]> {
  const merchantId = process.env.HEPSIBURADA_MERCHANT_ID;
  const url = `https://finance-external.hepsiburada.com/settlements/merchantid/${merchantId}?startDate=${period.periodStart}&endDate=${period.periodEnd}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`Hepsiburada hakediş alınamadı: HTTP ${res.status}`);
  const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
  return (data.items ?? []).map((s) => ({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    grossSales: String(s.grossAmount ?? '0'),
    commissions: String(s.commissionAmount ?? '0'),
    shippingDeductions: String(s.cargoAmount ?? '0'),
    otherDeductions: '0',
    returns: String(s.returnAmount ?? '0'),
    netPayout: String(s.netAmount ?? '0'),
    expectedPayoutDate: String(s.payoutDate ?? period.periodEnd),
  }));
}

export const hepsiburada = createMarketplaceProvider({
  channelCode: 'HEPSIBURADA',
  liveEnvVars: LIVE_ENV_VARS,
  liveFetchOrders,
  liveUpdateStock,
  liveFetchSettlements,
});

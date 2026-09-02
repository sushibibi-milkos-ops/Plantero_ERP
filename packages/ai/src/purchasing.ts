import { D, toDb } from '@plantero/core';
import { getClient, structuredComplete } from './client.js';

/**
 * Satın alma taslak motoru: kritik stok kurallarına göre tedarikçi bazlı gruplanmış
 * PO taslakları üretir. Fallback: order-up-to-max kuralı, minOrderQty'ye yuvarlama.
 */

export type ReplenishRule = {
  productId: string;
  productName: string;
  warehouseId: string;
  minQty: string;
  maxQty: string;
  onHandQty: string;
  incomingQty?: string;
};

export type ConsumptionPoint = { productId: string; avgDailyQty: string };

export type SupplierProductOption = {
  productId: string;
  partnerId: string;
  partnerName: string;
  price: string;
  currency: string;
  leadTimeDays: number;
  minOrderQty: string;
  isPreferred: boolean;
};

export type DraftPoLine = { productId: string; productName: string; qty: string; unitPrice: string; reason: string };
export type DraftPurchaseOrder = { partnerId: string; partnerName: string; currency: string; lines: DraftPoLine[]; rationale: string; confidence: number };

/** Kural tabanlı fallback (zorunlu): eldeki + gelen < min ise max seviyesine tamamla, MOQ katına yuvarla */
export function fallbackDraftPurchaseOrders(
  rules: ReplenishRule[],
  consumption: ConsumptionPoint[],
  supplierProducts: SupplierProductOption[],
): DraftPurchaseOrder[] {
  const consumptionByProduct = new Map(consumption.map((c) => [c.productId, D(c.avgDailyQty)]));
  const bySupplier = new Map<string, DraftPurchaseOrder>();

  for (const rule of rules) {
    const onHand = D(rule.onHandQty).plus(D(rule.incomingQty ?? '0'));
    const min = D(rule.minQty);
    const max = D(rule.maxQty).gt(0) ? D(rule.maxQty) : min;
    if (min.lte(0) || onHand.gte(min)) continue; // kritik seviyenin altında değil / kural tanımsız

    const needed = max.minus(onHand);
    if (needed.lte(0)) continue;

    const options = supplierProducts.filter((sp) => sp.productId === rule.productId);
    if (options.length === 0) continue; // tedarikçi tanımsız — bu kalem atlanır (raporda belirtilir)

    const preferred = options.find((o) => o.isPreferred);
    const chosen = preferred ?? [...options].sort((a, b) => D(a.price).minus(D(b.price)).toNumber())[0]!;

    let qty = needed;
    const moq = D(chosen.minOrderQty);
    if (moq.gt(0)) {
      const multiples = qty.div(moq).ceil();
      qty = multiples.mul(moq);
    }

    const key = chosen.partnerId;
    if (!bySupplier.has(key)) {
      bySupplier.set(key, {
        partnerId: chosen.partnerId,
        partnerName: chosen.partnerName,
        currency: chosen.currency,
        lines: [],
        rationale: 'Kritik stok motoru: order-up-to-max kuralı (kural tabanlı, AI kullanılmadı)',
        confidence: 0.6,
      });
    }

    const po = bySupplier.get(key)!;
    const avgDaily = consumptionByProduct.get(rule.productId);
    const reason = avgDaily
      ? `Eldeki ${onHand.toString()}, ort. günlük tüketim ${avgDaily.toString()} → ${max.toString()} seviyesine tamamlanıyor`
      : `Eldeki ${onHand.toString()}, min ${min.toString()} altında → max ${max.toString()} seviyesine tamamlanıyor`;

    po.lines.push({ productId: rule.productId, productName: rule.productName, qty: toDb(qty), unitPrice: toDb(D(chosen.price)), reason });
  }

  return Array.from(bySupplier.values());
}

async function tryAiDraft(
  rules: ReplenishRule[],
  consumption: ConsumptionPoint[],
  supplierProducts: SupplierProductOption[],
  fallback: DraftPurchaseOrder[],
): Promise<DraftPurchaseOrder[] | null> {
  const result = await structuredComplete<{ orders: DraftPurchaseOrder[] }>({
    system:
      'Sen Plantero ERP için satın alma planlama asistanısın. Kritik stok kurallarına, tüketim eğilimine ve tedarikçi ' +
      'seçeneklerine göre tedarikçi bazlı gruplanmış PO taslakları öner. Yalnızca verilen productId/partnerId değerlerini kullan.',
    prompt: JSON.stringify({ rules, consumption, supplierProducts, ruleBasedFallback: fallback }),
    toolName: 'report_draft_orders',
    toolDescription: 'Tedarikçi bazlı gruplanmış satın alma siparişi taslaklarını gerekçeleriyle döner',
    inputSchema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              partnerId: { type: 'string' },
              partnerName: { type: 'string' },
              currency: { type: 'string' },
              rationale: { type: 'string' },
              confidence: { type: 'number' },
              lines: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { productId: { type: 'string' }, productName: { type: 'string' }, qty: { type: 'string' }, unitPrice: { type: 'string' }, reason: { type: 'string' } },
                  required: ['productId', 'productName', 'qty', 'unitPrice', 'reason'],
                },
              },
            },
            required: ['partnerId', 'partnerName', 'currency', 'lines', 'rationale', 'confidence'],
          },
        },
      },
      required: ['orders'],
    },
  });
  if (!result?.orders?.length) return null;
  return result.orders;
}

/** Ana giriş noktası: AI varsa dener, yoksa/başarısızsa kural tabanlı fallback'e düşer */
export async function draftPurchaseOrders(
  rules: ReplenishRule[],
  consumption: ConsumptionPoint[],
  supplierProducts: SupplierProductOption[],
): Promise<DraftPurchaseOrder[]> {
  const fallback = fallbackDraftPurchaseOrders(rules, consumption, supplierProducts);
  if (!getClient()) return fallback;
  const ai = await tryAiDraft(rules, consumption, supplierProducts, fallback);
  return ai ?? fallback;
}

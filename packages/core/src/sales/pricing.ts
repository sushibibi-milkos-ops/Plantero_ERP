import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { customerPrices, priceLists, priceListItems, products, exchangeRates, type DbOrTx } from '@plantero/db';
import { D, toDb, round2, round4, pct, netFromGross, ZERO } from '../money.js';
import { businessDate } from '../dates.js';

/**
 * Fiyat çözümleme ve satır/kanal hesapları — `docs/modules/satis.md`.
 * Öncelik: müşteri özel fiyat (customer_prices) > fiyat listesi (kanal fiyat listesi dahil) > ürün liste fiyatı.
 */

/** 'free': elle 0 (veya altı) birim fiyatlı satır, yalnızca açık "ücretsiz/numune" bayrağıyla kabul edilir (bkz. sales/orders.ts buildLine). */
export type PriceSource = 'customer' | 'channel' | 'list' | 'manual' | 'free';

export type ResolvedPrice = { unitPrice: Decimal; source: PriceSource; currency: string };

export type ResolvePriceInput = {
  productId: string;
  partnerId: string;
  /** Sipariş/teklifin fiyat listesi — kanal fiyat listesiyse `source: 'channel'` döner */
  priceListId?: string | null;
  qty: Decimal;
  asOf?: string | Date;
};

/** Müşteri özel fiyatı, yoksa fiyat listesi satırı (kanal fiyat listesi dahil), o da yoksa ürünün liste fiyatı. */
export async function resolvePrice(tx: DbOrTx, opts: ResolvePriceInput): Promise<ResolvedPrice> {
  const asOf = businessDate(opts.asOf ?? new Date());
  const qtyStr = toDb(opts.qty);

  const custRows = await tx
    .select()
    .from(customerPrices)
    .where(
      and(
        eq(customerPrices.partnerId, opts.partnerId),
        eq(customerPrices.productId, opts.productId),
        lte(customerPrices.minQty, qtyStr),
        or(isNull(customerPrices.validFrom), lte(customerPrices.validFrom, asOf)),
        or(isNull(customerPrices.validTo), gte(customerPrices.validTo, asOf)),
      ),
    )
    .orderBy(desc(customerPrices.minQty))
    .limit(1);
  if (custRows[0]) return { unitPrice: D(custRows[0].price), source: 'customer', currency: custRows[0].currency };

  if (opts.priceListId) {
    const [list] = await tx.select().from(priceLists).where(eq(priceLists.id, opts.priceListId)).limit(1);
    const itemRows = await tx
      .select()
      .from(priceListItems)
      .where(
        and(
          eq(priceListItems.priceListId, opts.priceListId),
          eq(priceListItems.productId, opts.productId),
          lte(priceListItems.minQty, qtyStr),
          or(isNull(priceListItems.validFrom), lte(priceListItems.validFrom, asOf)),
          or(isNull(priceListItems.validTo), gte(priceListItems.validTo, asOf)),
        ),
      )
      .orderBy(desc(priceListItems.minQty))
      .limit(1);
    if (itemRows[0]) {
      let price = D(itemRows[0].price);
      if (list?.includesVat) {
        const [product] = await tx.select({ vatRate: products.vatRate }).from(products).where(eq(products.id, opts.productId)).limit(1);
        price = netFromGross(price, D(product?.vatRate ?? 1));
      }
      return { unitPrice: round4(price), source: list?.channelId ? 'channel' : 'list', currency: list?.currency ?? 'TRY' };
    }
  }

  const [product] = await tx.select({ listPrice: products.listPrice }).from(products).where(eq(products.id, opts.productId)).limit(1);
  return { unitPrice: D(product?.listPrice ?? 0), source: 'list', currency: 'TRY' };
}

export type LineTotals = { lineSubtotal: Decimal; lineVat: Decimal; lineTotal: Decimal; discountAmount: Decimal };

/** Satır toplamları: iskonto sonrası ara toplam → KDV → genel toplam. Girdiler net (KDV hariç) fiyat kabul eder. */
export function computeLineTotals(opts: { qty: Decimal; unitPrice: Decimal; discountPct?: Decimal | null; vatRate: Decimal }): LineTotals {
  const gross = round4(opts.qty.mul(opts.unitPrice));
  const discountAmount = opts.discountPct && !opts.discountPct.isZero() ? round4(pct(gross, opts.discountPct)) : ZERO;
  const lineSubtotal = round4(gross.minus(discountAmount));
  const lineVat = round4(pct(lineSubtotal, opts.vatRate));
  const lineTotal = round4(lineSubtotal.plus(lineVat));
  return { lineSubtotal, lineVat, lineTotal, discountAmount };
}

export type ChannelDeductions = { commissionAmount: Decimal; shippingDeduction: Decimal; otherDeduction: Decimal; netRevenue: Decimal };

/** Kanal kesintileri (komisyon %, sipariş başı kargo, diğer %) → net ciro. Baz: sipariş ara toplamı (KDV hariç). */
export function computeChannelDeductions(
  subtotal: Decimal,
  channel: { commissionPct: Decimal | string; shippingDeductionPerOrder: Decimal | string; otherDeductionPct: Decimal | string },
): ChannelDeductions {
  const commissionAmount = round4(pct(subtotal, D(channel.commissionPct)));
  const shippingDeduction = round4(D(channel.shippingDeductionPerOrder));
  const otherDeduction = round4(pct(subtotal, D(channel.otherDeductionPct)));
  const netRevenue = round4(subtotal.minus(commissionAmount).minus(shippingDeduction).minus(otherDeduction));
  return { commissionAmount, shippingDeduction, otherDeduction, netRevenue };
}

/**
 * TCMB kuru: TRY için her zaman 1. Dövizli işlemde satış tarafı geleneksel olarak "döviz alış" kuruyla
 * TL'ye çevrilir (şirket dövizi bankaya satacağı kur). Verilen tarihe eşit ya da öncesindeki en yakın kur
 * kullanılır (`exchange_rates` — worker `tcmb-rates` job'ı doldurur). Bulunamazsa `null`.
 */
export async function getExchangeRate(tx: DbOrTx, currency: string, date: string | Date, side: 'buying' | 'selling' = 'buying'): Promise<Decimal | null> {
  if (currency === 'TRY') return D(1);
  const ds = businessDate(date);
  const [row] = await tx
    .select({ buying: exchangeRates.buying, selling: exchangeRates.selling })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currency, currency), lte(exchangeRates.rateDate, ds)))
    .orderBy(desc(exchangeRates.rateDate))
    .limit(1);
  if (!row) return null;
  return round2(D(side === 'buying' ? row.buying : row.selling));
}

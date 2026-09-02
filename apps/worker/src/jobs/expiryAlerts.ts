import { and, eq, gt, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { db, notifications, products, stockLots, stockQuants } from '@plantero/db';

const HORIZON_DAYS = 60; // ExpiryBadge turuncu eşiği ve altını kapsar (60/30/geçmiş)
const DEDUP_WINDOW_HOURS = 20; // günlük 07:00 çalıştırması için tekrar bildirim engeli

/**
 * SKT uyarı motoru: karantina dışı (released) ve elinde stok bulunan lotlardan son
 * kullanma tarihi 60 gün içinde olanlar için in_app bildirim üretir. Aynı lot için son
 * 20 saat içinde bildirim varsa tekrar üretmez (günlük çalıştırma ile uyumlu basit koruma).
 */
export async function runExpiryAlerts(): Promise<Record<string, unknown>> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + HORIZON_DAYS);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const rows = await db
    .select({
      lotId: stockLots.id,
      lotNo: stockLots.lotNo,
      productId: stockLots.productId,
      productName: products.name,
      expiryDate: stockLots.expiryDate,
      qty: sql<string>`sum(${stockQuants.qty})`.as('qty'),
    })
    .from(stockLots)
    .innerJoin(stockQuants, eq(stockQuants.lotId, stockLots.id))
    .innerJoin(products, eq(products.id, stockLots.productId))
    .where(and(eq(stockLots.status, 'released'), isNotNull(stockLots.expiryDate), lte(stockLots.expiryDate, horizonIso), gt(stockQuants.qty, '0')))
    .groupBy(stockLots.id, stockLots.lotNo, stockLots.productId, products.name, stockLots.expiryDate);

  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000);
  let alertsCreated = 0;

  for (const r of rows) {
    if (!r.qty || Number(r.qty) <= 0 || !r.expiryDate) continue;

    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.refTable, 'stock_lots'), eq(notifications.refId, r.lotId), gte(notifications.createdAt, dedupSince)))
      .limit(1);
    if (existing.length > 0) continue;

    const days = Math.floor((new Date(r.expiryDate).getTime() - today.getTime()) / 86_400_000);
    const urgency = days < 0 ? 'GEÇMİŞ' : days < 30 ? 'KRİTİK' : 'UYARI';

    await db.insert(notifications).values({
      channel: 'in_app',
      status: 'pending',
      title: `SKT ${urgency}: ${r.productName} (Lot ${r.lotNo})`,
      body: `${r.productName} ürününün ${r.lotNo} lotu için son kullanma tarihi ${r.expiryDate} (${days} gün). Eldeki miktar: ${r.qty}.`,
      href: '/depo/skt',
      refTable: 'stock_lots',
      refId: r.lotId,
    });
    alertsCreated++;
  }

  return { lotsEvaluated: rows.length, alertsCreated, horizonDays: HORIZON_DAYS };
}

import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D, toDb } from '@plantero/core';
import { businessDate } from '@plantero/core/dates';
import {
  getGmDashboard, getWarehouseCards, getProductionChiefCards, getFinanceCards, getSalesCards,
  getQualityCards, getMaintenanceCards,
  type GmDashboard, type WarehouseCards, type ProductionChiefCards, type FinanceCards, type SalesCards,
  type QualityCards, type MaintenanceCards,
} from '@plantero/core/cockpit/kpis';

const { deliveries, deliveryLines, receipts, receiptLines, workOrders, invoices, products, uoms, partners, productionLines, payments } = schema;

/**
 * Kokpit ekranının veri kaynağı — 'server-only'. Tüm KPI RAKAMLARI `packages/core/src/cockpit/kpis.ts`
 * fonksiyonlarından gelir (rol bazlı yedi pano fonksiyonu aşağıda); bu dosya yalnızca (a) rol panosu
 * seçimi için ince bir sarmalayıcı katman, (b) KPI olmayan, salt görsel "bugün ne oldu" belge akışları
 * (aşağıdaki `getCockpitToday` / `getCockpitPaymentsToday`) sağlar — bunlar tek bir sayı üretmez,
 * dolayısıyla `kpis.test.ts`'in "SQL ile doğrulanabilir KPI" kapsamına girmez.
 */

export type CockpitDashboard =
  | { role: 'gm'; data: GmDashboard }
  | { role: 'depo'; data: WarehouseCards }
  | { role: 'uretim_sefi'; data: ProductionChiefCards }
  | { role: 'finans'; data: FinanceCards }
  | { role: 'satis'; data: SalesCards }
  | { role: 'kalite'; data: QualityCards }
  | { role: 'bakim'; data: MaintenanceCards };

/**
 * Kullanıcının rollerinden HANGİ rol panosunun gösterileceğine karar verir. Öncelik sırası modül
 * sözleşmesindeki (docs/modules/kokpit.md) kapsamlılık sırasıyla eşleşir: GM/admin en geniş panoyu
 * görür; birden çok "uzman" rolü olan kullanıcı (ör. muhasebe+finans test hesabı) en üstteki eşleşen
 * tek panoyu görür — sekmeli çoklu pano modül sözleşmesinde istenmiyor.
 */
export function resolveDashboardRole(roles: string[]): CockpitDashboard['role'] {
  const has = (r: string) => roles.includes(r);
  if (has('admin') || has('genel_mudur')) return 'gm';
  if (has('muhasebe') || has('finans')) return 'finans';
  if (has('satis')) return 'satis';
  if (has('depo')) return 'depo';
  if (has('uretim_sefi')) return 'uretim_sefi';
  if (has('kalite')) return 'kalite';
  if (has('bakim')) return 'bakim';
  return 'gm';
}

/**
 * `unstable_cache` ile 60 sn önbellek (docs/modules/kokpit.md: "60 sn revalidate") — pano verisi
 * kullanıcıya özel DEĞİL (rol'e özel), bu yüzden aynı rolü paylaşan tüm kullanıcılar arasında
 * güvenle paylaşılabilir; ağır çok-tabloluk KPI sorgularının her sayfa açılışında yeniden
 * hesaplanmasını önler. `requirePermission` (cookie/oturum okuma) çağrısı sayfa bileşeninde, bu
 * fonksiyonun DIŞINDA kalır — Next.js dinamik API kullanımını burada değil orada tespit eder,
 * dolayısıyla oturum kontrolü her istekte taze kalırken yalnızca KPI verisi 60 sn önbelleklenir.
 */
async function loadDashboard(role: CockpitDashboard['role']): Promise<CockpitDashboard> {
  switch (role) {
    case 'gm': return { role, data: await getGmDashboard(db) };
    case 'depo': return { role, data: await getWarehouseCards(db) };
    case 'uretim_sefi': return { role, data: await getProductionChiefCards(db) };
    case 'finans': return { role, data: await getFinanceCards(db) };
    case 'satis': return { role, data: await getSalesCards(db) };
    case 'kalite': return { role, data: await getQualityCards(db) };
    case 'bakim': return { role, data: await getMaintenanceCards(db) };
  }
}

const cachedDashboardByRole: Record<CockpitDashboard['role'], () => Promise<CockpitDashboard>> = {
  gm: unstable_cache(() => loadDashboard('gm'), ['cockpit-dashboard-gm'], { revalidate: 60, tags: ['cockpit'] }),
  depo: unstable_cache(() => loadDashboard('depo'), ['cockpit-dashboard-depo'], { revalidate: 60, tags: ['cockpit'] }),
  uretim_sefi: unstable_cache(() => loadDashboard('uretim_sefi'), ['cockpit-dashboard-uretim_sefi'], { revalidate: 60, tags: ['cockpit'] }),
  finans: unstable_cache(() => loadDashboard('finans'), ['cockpit-dashboard-finans'], { revalidate: 60, tags: ['cockpit'] }),
  satis: unstable_cache(() => loadDashboard('satis'), ['cockpit-dashboard-satis'], { revalidate: 60, tags: ['cockpit'] }),
  kalite: unstable_cache(() => loadDashboard('kalite'), ['cockpit-dashboard-kalite'], { revalidate: 60, tags: ['cockpit'] }),
  bakim: unstable_cache(() => loadDashboard('bakim'), ['cockpit-dashboard-bakim'], { revalidate: 60, tags: ['cockpit'] }),
};

export async function getCockpitDashboard(roles: string[]): Promise<CockpitDashboard> {
  const role = resolveDashboardRole(roles);
  return cachedDashboardByRole[role]();
}

export type CockpitTodayItem = {
  kind: 'Sevkiyat' | 'İş emri' | 'Mal kabul' | 'Fatura';
  no: string;
  href: string;
  partner: string;
  status: string;
  k: 'delivery' | 'work_order' | 'receipt' | 'invoice';
  amount?: string;
  qty?: string;
  uom?: string;
  at: Date;
};

/** Bugünün belgeleri: gerçekten bugün oluşturulmuş/güncellenmiş belgeler + şu an aktif iş emirleri (GM/admin panosu, "son aktiviteler"in belge tarafı). */
async function loadCockpitToday(): Promise<CockpitTodayItem[]> {
  const today = businessDate(new Date());
  const startOfDay = new Date(`${today}T00:00:00.000Z`);

  const [deliveryRows, workOrderRows, receiptRows, invoiceRows] = await Promise.all([
    db
      .select({ id: deliveries.id, docNo: deliveries.docNo, status: deliveries.status, partnerName: partners.name, createdAt: deliveries.createdAt })
      .from(deliveries)
      .innerJoin(partners, eq(partners.id, deliveries.partnerId))
      .where(gte(deliveries.updatedAt, startOfDay))
      .orderBy(desc(deliveries.updatedAt))
      .limit(4),
    db
      .select({ id: workOrders.id, docNo: workOrders.docNo, status: workOrders.status, lineName: productionLines.name, productName: products.name, producedQty: workOrders.producedQty, uomCode: uoms.code, startedAt: workOrders.startedAt })
      .from(workOrders)
      .innerJoin(products, eq(products.id, workOrders.productId))
      .innerJoin(uoms, eq(uoms.id, workOrders.uomId))
      .innerJoin(productionLines, eq(productionLines.id, workOrders.lineId))
      .where(inArray(workOrders.status, ['in_progress', 'paused']))
      .orderBy(desc(workOrders.startedAt))
      .limit(4),
    db
      .select({ id: receipts.id, docNo: receipts.docNo, status: receipts.status, partnerName: partners.name, createdAt: receipts.createdAt })
      .from(receipts)
      .leftJoin(partners, eq(partners.id, receipts.partnerId))
      .where(gte(receipts.updatedAt, startOfDay))
      .orderBy(desc(receipts.updatedAt))
      .limit(4),
    db
      .select({ id: invoices.id, docNo: invoices.docNo, status: invoices.status, partnerName: partners.name, grandTotal: invoices.grandTotalTry, postedAt: invoices.postedAt })
      .from(invoices)
      .innerJoin(partners, eq(partners.id, invoices.partnerId))
      .where(and(eq(invoices.kind, 'sales'), isNotNull(invoices.postedAt), gte(invoices.postedAt, startOfDay)))
      .orderBy(desc(invoices.postedAt))
      .limit(4),
  ]);

  // Mal kabul değeri: satır bazlı (qty × unitCost) toplamı — ayrı sorgu (üstteki select'e korelasyonlu
  // alt sorgu eklemek yerine, okunabilirlik için burada toplanır). Sevkiyat maliyeti (SMM) kokpit
  // belge özetinde gösterilmez (satış fiyatı değil); bunun yerine satır (kalem) sayısı gösterilir —
  // ürünler farklı birimlerde olabileceğinden miktarları toplamak yanıltıcı olurdu.
  const [receiptValues, deliveryLineCounts] = await Promise.all([
    Promise.all(receiptRows.map((r) => db.select({ qty: receiptLines.qty, unitCost: receiptLines.unitCost }).from(receiptLines).where(eq(receiptLines.receiptId, r.id)))),
    Promise.all(deliveryRows.map((r) => db.select({ n: deliveryLines.id }).from(deliveryLines).where(eq(deliveryLines.deliveryId, r.id)))),
  ]);

  const items: CockpitTodayItem[] = [
    ...deliveryRows.map((r, i): CockpitTodayItem => ({ kind: 'Sevkiyat', no: r.docNo, href: `/depo/sevkiyat/${r.id}`, partner: r.partnerName, status: r.status, k: 'delivery', qty: String(deliveryLineCounts[i]!.length), uom: 'kalem', at: r.createdAt })),
    ...workOrderRows.map((r): CockpitTodayItem => ({ kind: 'İş emri', no: r.docNo, href: `/uretim/is-emirleri/${r.id}`, partner: `${r.lineName} · ${r.productName}`, status: r.status, k: 'work_order', qty: r.producedQty, uom: r.uomCode, at: r.startedAt ?? new Date(0) })),
    ...receiptRows.map((r, i): CockpitTodayItem => ({
      kind: 'Mal kabul', no: r.docNo, href: `/depo/mal-kabul/${r.id}`, partner: r.partnerName ?? '—', status: r.status, k: 'receipt',
      amount: toDb(receiptValues[i]!.reduce((acc, l) => acc.plus(D(l.qty).mul(D(l.unitCost))), D(0))), at: r.createdAt,
    })),
    ...invoiceRows.map((r): CockpitTodayItem => ({ kind: 'Fatura', no: r.docNo, href: `/muhasebe/faturalar/${r.id}`, partner: r.partnerName, status: r.status, k: 'invoice', amount: r.grandTotal, at: r.postedAt ?? new Date() })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);
}

export const getCockpitToday = unstable_cache(loadCockpitToday, ['cockpit-today'], { revalidate: 60, tags: ['cockpit'] });

export type CockpitReceipt = { id: string; docNo: string; partnerName: string; amount: string; method: string };

/** Bugünkü tahsilatlar (banka/kasa) — Muhasebe/Finans panosunda "bugün ne tahsil edildi" listesi. */
async function loadCockpitPaymentsToday(): Promise<CockpitReceipt[]> {
  const today = businessDate(new Date());
  const rows = await db
    .select({ id: payments.id, docNo: payments.docNo, partnerName: partners.name, amount: payments.amountTry, method: payments.method })
    .from(payments)
    .innerJoin(partners, eq(partners.id, payments.partnerId))
    .where(and(eq(payments.direction, 'inbound'), eq(payments.status, 'posted'), eq(payments.paymentDate, today)))
    .orderBy(desc(payments.createdAt))
    .limit(5);
  return rows;
}

export const getCockpitPaymentsToday = unstable_cache(loadCockpitPaymentsToday, ['cockpit-payments-today'], { revalidate: 60, tags: ['cockpit'] });

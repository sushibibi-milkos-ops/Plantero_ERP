import 'server-only';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { getChain, docProgress } from '@plantero/core';

const {
  exportShipments, exportDocuments, exportPackages, salesOrders, salesOrderLines, deliveries, invoices, partners, products, uoms, users, hsCodes, exchangeRates, stockLots,
} = schema;

/* ==================================================================== */
/* Ortak arama listeleri                                                */
/* ==================================================================== */

/** İhracat siparişi olup henüz bir sevkiyata bağlanmamış, taslak/iptal olmayan siparişler. */
export async function listEligibleExportOrders() {
  const rows = await db
    .select({ o: salesOrders, partnerName: partners.name })
    .from(salesOrders)
    .innerJoin(partners, eq(partners.id, salesOrders.partnerId))
    .where(and(eq(salesOrders.docType, 'order'), eq(salesOrders.isExport, true), isNull(salesOrders.exportShipmentId), ne(salesOrders.status, 'cancelled'), ne(salesOrders.status, 'lost')))
    .orderBy(desc(salesOrders.orderDate));
  return rows.map((r) => ({ id: r.o.id, docNo: r.o.docNo, status: r.o.status, partnerName: r.partnerName, currency: r.o.currency, grandTotal: r.o.grandTotal, incoterm: r.o.incoterm, orderDate: r.o.orderDate }));
}

export async function listResponsibleUsers() {
  return db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.fullName));
}

/* ==================================================================== */
/* /ihracat/sevkiyatlar                                                 */
/* ==================================================================== */

export type ShipmentRow = {
  id: string; docNo: string; status: string; regime: string; partnerName: string; destinationCountry: string;
  currency: string; amountTry: string; proformaAmount: string; incoterm: string; etd: string | null; eta: string | null;
  salesOrderId: string | null; salesOrderDocNo: string | null; docsDone: number; docsTotal: number; createdAt: Date;
};

export async function listShipments(): Promise<ShipmentRow[]> {
  const rows = await db
    .select({ s: exportShipments, partnerName: partners.name, soDocNo: salesOrders.docNo })
    .from(exportShipments)
    .innerJoin(partners, eq(partners.id, exportShipments.partnerId))
    .leftJoin(salesOrders, eq(salesOrders.id, exportShipments.salesOrderId))
    .orderBy(desc(exportShipments.createdAt));
  const docs = await db.select({ shipmentId: exportDocuments.shipmentId, status: exportDocuments.status }).from(exportDocuments);
  const docsByShipment = new Map<string, Array<{ status: (typeof docs)[number]['status'] }>>();
  for (const d of docs) {
    const arr = docsByShipment.get(d.shipmentId) ?? [];
    arr.push({ status: d.status });
    docsByShipment.set(d.shipmentId, arr);
  }
  return rows.map((r) => {
    const progress = docProgress(docsByShipment.get(r.s.id) ?? []);
    return {
      id: r.s.id, docNo: r.s.docNo, status: r.s.status, regime: r.s.regime, partnerName: r.partnerName,
      destinationCountry: r.s.destinationCountry, currency: r.s.currency, amountTry: r.s.amountTry, proformaAmount: r.s.proformaAmount,
      incoterm: r.s.incoterm, etd: r.s.etd, eta: r.s.eta, salesOrderId: r.s.salesOrderId, salesOrderDocNo: r.soDocNo ?? null,
      docsDone: progress.done, docsTotal: progress.total, createdAt: r.s.createdAt,
    };
  });
}

/* ==================================================================== */
/* /ihracat/sevkiyatlar/[id]                                            */
/* ==================================================================== */

export async function getShipmentDetail(id: string) {
  const [shipment] = await db.select().from(exportShipments).where(eq(exportShipments.id, id)).limit(1);
  if (!shipment) return null;
  const [partner] = await db.select().from(partners).where(eq(partners.id, shipment.partnerId)).limit(1);
  const [order] = shipment.salesOrderId ? await db.select().from(salesOrders).where(eq(salesOrders.id, shipment.salesOrderId)).limit(1) : [null];
  const orderLines = order
    ? await db
        .select({ line: salesOrderLines, sku: products.sku, productName: products.name, uomCode: uoms.code })
        .from(salesOrderLines)
        .innerJoin(products, eq(products.id, salesOrderLines.productId))
        .innerJoin(uoms, eq(uoms.id, salesOrderLines.uomId))
        .where(eq(salesOrderLines.orderId, order.id))
        .orderBy(asc(salesOrderLines.sequence))
    : [];
  const [delivery] = shipment.deliveryId ? await db.select().from(deliveries).where(eq(deliveries.id, shipment.deliveryId)).limit(1) : [null];
  const [invoice] = shipment.invoiceId ? await db.select().from(invoices).where(eq(invoices.id, shipment.invoiceId)).limit(1) : [null];

  const otherDeliveries = shipment.salesOrderId
    ? await db.select().from(deliveries).where(eq(deliveries.salesOrderId, shipment.salesOrderId)).orderBy(desc(deliveries.createdAt))
    : [];
  const otherInvoices = shipment.salesOrderId
    ? await db.select().from(invoices).where(and(eq(invoices.salesOrderId, shipment.salesOrderId), eq(invoices.isExport, true))).orderBy(desc(invoices.createdAt))
    : [];

  const packages = await db
    .select({ pkg: exportPackages, sku: products.sku, productName: products.name, lotNo: stockLots.lotNo, lotStatus: stockLots.status })
    .from(exportPackages)
    .innerJoin(products, eq(products.id, exportPackages.productId))
    .leftJoin(stockLots, eq(stockLots.id, exportPackages.lotId))
    .where(eq(exportPackages.shipmentId, id))
    .orderBy(asc(exportPackages.packageNo));

  const documents = await db
    .select({ doc: exportDocuments, responsibleName: users.fullName })
    .from(exportDocuments)
    .leftJoin(users, eq(users.id, exportDocuments.responsibleId))
    .where(eq(exportDocuments.shipmentId, id))
    .orderBy(asc(exportDocuments.sequence));

  const chain = await getChain(db, 'export_shipment', id);

  return {
    shipment, partner: partner ?? null, order: order ?? null, orderLines, delivery: delivery ?? null, invoice: invoice ?? null,
    otherDeliveries, otherInvoices, packages: packages.map((p) => ({ ...p.pkg, sku: p.sku, productName: p.productName, lotNo: p.lotNo, lotStatus: p.lotStatus })),
    documents: documents.map((d) => ({ ...d.doc, responsibleName: d.responsibleName ?? null })), chain,
    progress: docProgress(documents.map((d) => ({ status: d.doc.status }))),
  };
}

/* ==================================================================== */
/* /ihracat/belgeler — tüm sevkiyatların belge takip panosu             */
/* ==================================================================== */

export type ExportDocRow = {
  id: string; shipmentId: string; shipmentDocNo: string; partnerName: string; code: string; name: string; status: string;
  docNo: string | null; dueDate: string | null; responsibleName: string | null; shipmentStatus: string;
};

export async function listAllExportDocuments(): Promise<ExportDocRow[]> {
  const rows = await db
    .select({ doc: exportDocuments, shipmentDocNo: exportShipments.docNo, shipmentStatus: exportShipments.status, partnerName: partners.name, responsibleName: users.fullName })
    .from(exportDocuments)
    .innerJoin(exportShipments, eq(exportShipments.id, exportDocuments.shipmentId))
    .innerJoin(partners, eq(partners.id, exportShipments.partnerId))
    .leftJoin(users, eq(users.id, exportDocuments.responsibleId))
    .where(ne(exportShipments.status, 'cancelled'))
    .orderBy(asc(exportDocuments.dueDate), desc(exportShipments.createdAt));
  return rows.map((r) => ({
    id: r.doc.id, shipmentId: r.doc.shipmentId, shipmentDocNo: r.shipmentDocNo, partnerName: r.partnerName, code: r.doc.code,
    name: r.doc.name, status: r.doc.status, docNo: r.doc.docNo, dueDate: r.doc.dueDate, responsibleName: r.responsibleName ?? null,
    shipmentStatus: r.shipmentStatus,
  }));
}

/* ==================================================================== */
/* /ihracat/kurlar                                                      */
/* ==================================================================== */

export type RateRow = { currency: string; rateDate: string; buying: string; selling: string; source: string };

export async function listRecentRates(days = 90): Promise<RateRow[]> {
  const rows = await db
    .select({ currency: exchangeRates.currency, rateDate: exchangeRates.rateDate, buying: exchangeRates.buying, selling: exchangeRates.selling, source: exchangeRates.source })
    .from(exchangeRates)
    .where(inArray(exchangeRates.currency, ['USD', 'EUR', 'GBP']))
    .orderBy(desc(exchangeRates.rateDate));
  // Son N günü tut (para birimi başına) — tarih azalan geldiğinden ilk N tekil tarih yeterli.
  const seenDates = new Set<string>();
  const out: RateRow[] = [];
  for (const r of rows) {
    seenDates.add(r.rateDate);
    if (seenDates.size > days && !out.some((o) => o.rateDate === r.rateDate)) continue;
    out.push(r);
  }
  return out.sort((a, b) => (a.rateDate < b.rateDate ? -1 : a.rateDate > b.rateDate ? 1 : a.currency.localeCompare(b.currency)));
}

export async function getLatestRates(): Promise<RateRow[]> {
  const all = await listRecentRates(1);
  const latestDate = all.length ? all[all.length - 1]!.rateDate : null;
  return latestDate ? all.filter((r) => r.rateDate === latestDate) : [];
}

export async function listHsCodes() {
  return db.select().from(hsCodes).orderBy(asc(hsCodes.code));
}

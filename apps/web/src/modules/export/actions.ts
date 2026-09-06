'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db, exchangeRates } from '@plantero/db';
import {
  createFromOrder, updateLogistics, generateProforma, linkDelivery, buildPackingList, advanceToCustoms,
  markShipped, markShipmentDelivered, linkInvoice, closeShipment, cancelShipment, updateExportDocument,
  updateProduct,
} from '@plantero/core';
import { tcmb } from '@plantero/integrations/rates/tcmb';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

const incotermEnum = z.enum(['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']);

function revalidateShipment(id: string) {
  revalidatePath('/ihracat/sevkiyatlar');
  revalidatePath(`/ihracat/sevkiyatlar/${id}`);
  revalidatePath('/ihracat/belgeler');
}

/* ==================================================================== */
/* Sevkiyat oluşturma / lojistik                                        */
/* ==================================================================== */

const createSchema = z.object({
  salesOrderId: z.string().uuid('Sipariş seçin'),
  incoterm: incotermEnum,
  incotermPlace: z.string().trim().optional().nullable(),
  destinationCountry: z.string().trim().min(2, 'Ülke kodu girin').max(2),
  portOfLoading: z.string().trim().optional().nullable(),
  portOfDischarge: z.string().trim().optional().nullable(),
  transportMode: z.string().trim().optional().nullable(),
  carrier: z.string().trim().optional().nullable(),
  regime: z.enum(['standard', 'etgb']).optional(),
  note: z.string().trim().optional().nullable(),
});

export const createShipmentAction = withAudit('export.createShipment', async (raw: z.infer<typeof createSchema>) => {
  const user = await requirePermission('export.manage');
  const input = createSchema.parse(raw);
  const shipment = await db.transaction((tx) =>
    createFromOrder(tx, {
      salesOrderId: input.salesOrderId, incoterm: input.incoterm, incotermPlace: input.incotermPlace || null,
      destinationCountry: input.destinationCountry.toUpperCase(), portOfLoading: input.portOfLoading || null,
      portOfDischarge: input.portOfDischarge || null, transportMode: input.transportMode || null, carrier: input.carrier || null,
      regime: input.regime, note: input.note || null, ownerId: user.userId,
    }, user.actor));
  revalidateShipment(shipment.id);
  return { data: { id: shipment.id, docNo: shipment.docNo }, audit: { action: 'create', tableName: 'export_shipments', recordId: shipment.id, summary: `İhracat sevkiyatı ${shipment.docNo} oluşturuldu`, after: shipment } };
});

const idSchema = z.object({ id: z.string().uuid() });

const logisticsSchema = idSchema.extend({
  incoterm: incotermEnum.optional(),
  incotermPlace: z.string().trim().optional().nullable(),
  destinationCountry: z.string().trim().min(2).max(2).optional(),
  portOfLoading: z.string().trim().optional().nullable(),
  portOfDischarge: z.string().trim().optional().nullable(),
  transportMode: z.string().trim().optional().nullable(),
  carrier: z.string().trim().optional().nullable(),
  trackingNo: z.string().trim().optional().nullable(),
  etd: z.string().trim().optional().nullable(),
  eta: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export const updateShipmentLogisticsAction = withAudit('export.updateLogistics', async (raw: z.infer<typeof logisticsSchema>) => {
  const user = await requirePermission('export.manage');
  const input = logisticsSchema.parse(raw);
  const { id, ...patch } = input;
  const shipment = await db.transaction((tx) =>
    updateLogistics(tx, id, { ...patch, destinationCountry: patch.destinationCountry?.toUpperCase() }, user.actor));
  revalidateShipment(id);
  return { data: { id: shipment.id }, audit: { action: 'update', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} lojistik bilgileri güncellendi` } };
});

/* ==================================================================== */
/* Durum akışı                                                          */
/* ==================================================================== */

export const generateProformaAction = withAudit('export.generateProforma', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('export.manage');
  const input = idSchema.parse(raw);
  const shipment = await db.transaction((tx) => generateProforma(tx, input.id, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id, status: shipment.status }, audit: { action: 'post', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} proforma gönderildi (${shipment.proformaNo})` } };
});

const linkDeliverySchema = idSchema.extend({ deliveryId: z.string().uuid() });

export const linkDeliveryAction = withAudit('export.linkDelivery', async (raw: z.infer<typeof linkDeliverySchema>) => {
  const user = await requirePermission('export.manage');
  const input = linkDeliverySchema.parse(raw);
  const shipment = await db.transaction((tx) => linkDelivery(tx, input.id, input.deliveryId, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id }, audit: { action: 'update', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} irsaliyeye bağlandı` } };
});

export const buildPackingListAction = withAudit('export.buildPackingList', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('export.manage');
  const input = idSchema.parse(raw);
  const { shipment, packages } = await db.transaction((tx) => buildPackingList(tx, input.id, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id, packageCount: packages.length, regime: shipment.regime }, audit: { action: 'update', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} çeki listesi kuruldu (${packages.length} kap, rejim: ${shipment.regime})` } };
});

const customsSchema = idSchema.extend({ customsDeclarationNo: z.string().trim().optional().nullable(), customsDate: z.string().trim().optional().nullable(), etgbNo: z.string().trim().optional().nullable() });

export const advanceToCustomsAction = withAudit('export.advanceToCustoms', async (raw: z.infer<typeof customsSchema>) => {
  const user = await requirePermission('export.manage');
  const input = customsSchema.parse(raw);
  const shipment = await db.transaction((tx) => advanceToCustoms(tx, input.id, { customsDeclarationNo: input.customsDeclarationNo || null, customsDate: input.customsDate || null, etgbNo: input.etgbNo || null }, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id, status: shipment.status }, audit: { action: 'post', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} gümrük işlemine alındı` } };
});

export const markShippedAction = withAudit('export.markShipped', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('export.manage');
  const input = idSchema.parse(raw);
  const shipment = await db.transaction((tx) => markShipped(tx, input.id, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id, status: shipment.status }, audit: { action: 'post', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} yüklendi (sevk edildi)` } };
});

export const markShipmentDeliveredAction = withAudit('export.markShipmentDelivered', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('export.manage');
  const input = idSchema.parse(raw);
  const shipment = await db.transaction((tx) => markShipmentDelivered(tx, input.id, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id, status: shipment.status }, audit: { action: 'post', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} alıcıya teslim edildi` } };
});

const linkInvoiceSchema = idSchema.extend({ invoiceId: z.string().uuid() });

export const linkInvoiceAction = withAudit('export.linkInvoice', async (raw: z.infer<typeof linkInvoiceSchema>) => {
  const user = await requirePermission('export.manage');
  const input = linkInvoiceSchema.parse(raw);
  const shipment = await db.transaction((tx) => linkInvoice(tx, input.id, input.invoiceId, user.actor));
  revalidateShipment(input.id);
  revalidatePath('/muhasebe/faturalar');
  return { data: { id: shipment.id }, audit: { action: 'update', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} faturaya bağlandı` } };
});

export const closeShipmentAction = withAudit('export.closeShipment', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('export.manage');
  const input = idSchema.parse(raw);
  const shipment = await db.transaction((tx) => closeShipment(tx, input.id, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id, status: shipment.status }, audit: { action: 'post', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} kapatıldı` } };
});

const cancelSchema = idSchema.extend({ reason: z.string().trim().optional().nullable() });

export const cancelShipmentAction = withAudit('export.cancelShipment', async (raw: z.infer<typeof cancelSchema>) => {
  const user = await requirePermission('export.manage');
  const input = cancelSchema.parse(raw);
  const shipment = await db.transaction((tx) => cancelShipment(tx, input.id, input.reason || null, user.actor));
  revalidateShipment(input.id);
  return { data: { id: shipment.id, status: shipment.status }, audit: { action: 'cancel', tableName: 'export_shipments', recordId: shipment.id, summary: `${shipment.docNo} iptal edildi` } };
});

/* ==================================================================== */
/* Belge takibi                                                         */
/* ==================================================================== */

const docUpdateSchema = z.object({
  documentId: z.string().uuid(),
  shipmentId: z.string().uuid(),
  status: z.enum(['required', 'in_progress', 'ready', 'sent', 'received', 'not_required']).optional(),
  docNo: z.string().trim().optional().nullable(),
  issuedAt: z.string().trim().optional().nullable(),
  responsibleId: z.string().uuid().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export const updateExportDocumentAction = withAudit('export.updateDocument', async (raw: z.infer<typeof docUpdateSchema>) => {
  const user = await requirePermission('export.manage');
  const input = docUpdateSchema.parse(raw);
  const doc = await db.transaction((tx) => updateExportDocument(tx, input.documentId, {
    status: input.status, docNo: input.docNo, issuedAt: input.issuedAt, responsibleId: input.responsibleId, dueDate: input.dueDate, note: input.note,
  }, user.actor));
  revalidatePath('/ihracat/belgeler');
  revalidatePath(`/ihracat/sevkiyatlar/${input.shipmentId}`);
  return { data: { id: doc.id, status: doc.status }, audit: { action: 'update', tableName: 'export_documents', recordId: doc.id, summary: `${doc.name} → ${doc.status}` } };
});

/* ==================================================================== */
/* Kurlar — TCMB "bugünü çek" (sandbox — env yoksa deterministik sahte)  */
/* ==================================================================== */

export const fetchTodayRatesAction = withAudit('export.fetchTodayRates', async () => {
  await requirePermission('export.manage');
  const today = new Date();
  const dateIso = today.toISOString().slice(0, 10);
  const rates = await tcmb.fetchDaily(today);
  const source = tcmb.mode === 'live' ? 'TCMB' : 'TCMB-SANDBOX';
  for (const r of rates) {
    await db
      .insert(exchangeRates)
      .values({ currency: r.currency, rateDate: dateIso, buying: r.buying, selling: r.selling, source })
      .onConflictDoUpdate({ target: [exchangeRates.currency, exchangeRates.rateDate], set: { buying: r.buying, selling: r.selling, source, fetchedAt: new Date() } });
  }
  revalidatePath('/ihracat/kurlar');
  return { data: { count: rates.length, mode: tcmb.mode }, audit: { action: 'sync', tableName: 'exchange_rates', summary: `TCMB kurları çekildi (${dateIso}, ${rates.length} para birimi, ${tcmb.mode === 'live' ? 'canlı' : 'sandbox'})` } };
});

/* ==================================================================== */
/* GTİP — ürün eşlemesi (products.hsCode, /ihracat/gtip)                */
/* ==================================================================== */

const assignHsCodeSchema = z.object({
  productId: z.string().uuid(),
  hsCode: z.string().trim().max(20).optional().nullable(),
});

/**
 * `products.hsCode` yalnızca bu tek alanı değiştirir — ürün adı/barkod gibi kilitli alanlara
 * dokunmaz, bu yüzden `updateProduct`'ın kimlik-değişikliği onayı (`allowIdentityChange`) gerekmez.
 * Şema `products` ana veri modülüne ait olsa da GTİP ataması fiilen bir ihracat işlevidir
 * (docs/modules/ihracat.md "/ihracat/gtip") — bu yüzden izin `export.manage`'dir, `masterdata.manage`
 * değil; ürünün diğer tüm alanları için asıl düzenleme ekranı yine `/ana-veri/urunler/[id]`'dir.
 */
export const assignHsCodeAction = withAudit('export.assignHsCode', async (raw: z.infer<typeof assignHsCodeSchema>) => {
  await requirePermission('export.manage');
  const input = assignHsCodeSchema.parse(raw);
  const product = await db.transaction((tx) => updateProduct(tx, input.productId, { hsCode: input.hsCode || null }));
  revalidatePath('/ihracat/gtip');
  revalidatePath(`/ana-veri/urunler/${input.productId}`);
  return {
    data: { id: product.id, hsCode: product.hsCode },
    audit: { action: 'update', tableName: 'products', recordId: product.id, summary: `${product.sku} GTİP: ${product.hsCode ?? '—'}` },
  };
});

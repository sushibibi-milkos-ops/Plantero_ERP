import { eq, and, lte, desc } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  exportShipments, exportPackages, exportDocuments, salesOrders, deliveries, deliveryLines, invoices, partners, products,
  exchangeRates,
  type DbOrTx,
} from '@plantero/db';
import { D, toDb, toDbRate, round4, round6, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { ensureDocumentSet, updateExportDocument } from './documents.js';
import { checkEtgbLimit, resolveRegime } from './etgb.js';
import type { ActorCtx, DocumentOrigin } from '../types.js';

/**
 * İhracat sevkiyat zinciri — `docs/modules/ihracat.md` §1. Satış siparişi (`is_export=true`) →
 * sevkiyat (`export_shipments`) → proforma → çeki listesi (delivery'den) → belgeler → gümrük/ETGB →
 * yükleme → fatura & kur. `sales_orders`/`invoices` zaten (I36) kendi `is_export`/`vat_rate=0`
 * mantığını taşıyor; bu dosya yalnızca YENİ tablolara (export_shipments/packages/documents) yazar —
 * stok/muhasebe etkisi YOK (sevkiyatın kendisi bir belge takip katmanıdır; asıl sevk `stock/deliveries.ts`
 * `shipDelivery`de, fatura `sales/invoicing.ts`'te, kur farkı `finance/payments.ts::recordPayment`'te
 * zaten işlenir — burada tekrar edilmez).
 */

export type ShipmentStatus = (typeof exportShipments.$inferSelect)['status'];
export type ExportRegime = (typeof exportShipments.$inferSelect)['regime'];

export type CreateShipmentInput = {
  salesOrderId: string;
  regime?: ExportRegime;
  incoterm?: (typeof exportShipments.$inferSelect)['incoterm'];
  incotermPlace?: string | null;
  destinationCountry?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  transportMode?: string | null;
  carrier?: string | null;
  ownerId?: string | null;
  note?: string | null;
  origin?: DocumentOrigin;
};

async function reindex(tx: DbOrTx, s: typeof exportShipments.$inferSelect): Promise<void> {
  await indexDocument(tx, {
    type: 'export_shipment', recordId: s.id, docNo: s.docNo, partnerId: s.partnerId, status: s.status,
    origin: 'chain', title: `İhracat sevkiyatı ${s.docNo}`, amount: s.amountTry, docDate: s.proformaDate ? new Date(s.proformaDate) : new Date(),
  });
}

/**
 * `sales/pricing.ts::getExchangeRate` ile AYNI sorgu örüntüsü (I20: currency + rate_date <= tarih,
 * en yeni önce, 'buying') — ama ayrıca çözülen satırın GERÇEK `rate_date`'ini de döner. `getExchangeRate`
 * yalnızca katsayıyı döndürdüğü için `syncAmountTry` daha önce `exchangeRateDate` alanına aranan tarihi
 * (`effectiveDate` — proforma tarihi/bugün) yazıyordu; TCMB o gün için henüz yayın yapmamışsa (`bugün`
 * her zaman böyledir) sevkiyat hiç var olmayan bir kur gününe işaret ediyor ve `/ihracat/kurlar`
 * tablosuyla çelişiyordu (tur 6 P1). Burada dönen `rateDate` her zaman `exchange_rates`'te gerçekten
 * var olan bir satırı gösterir.
 */
async function resolveBuyingRate(tx: DbOrTx, currency: string, date: string): Promise<{ rate: Decimal; rateDate: string } | null> {
  const [row] = await tx
    .select({ rateDate: exchangeRates.rateDate, buying: exchangeRates.buying })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currency, currency), lte(exchangeRates.rateDate, date)))
    .orderBy(desc(exchangeRates.rateDate))
    .limit(1);
  return row ? { rate: round6(D(row.buying)), rateDate: row.rateDate } : null;
}

/**
 * I55 — fatura bağlanmadan önceki HER durum geçişinde `amountTry`/`exchangeRate`/`exchangeRateDate`
 * senkronunu tazeler. Referans tutar `proformaAmount` (>0 ise) yoksa bağlı siparişin GÜNCEL
 * `grandTotal`'ı; kur `resolveBuyingRate` ile proforma tarihine (yoksa bugüne) en yakın ÖNCEKİ günden
 * yeniden çözülür ve `exchangeRateDate`'e o satırın kendi `rate_date`'i yazılır (aranan tarih değil —
 * bkz. `resolveBuyingRate` yorumu); kur bulunamazsa (TCMB verisi yoksa) mevcut kur/tarih korunur,
 * sessizce eski kalmaz — yalnızca referans tutar × kur her zaman tutarlı yazılır
 * (`checks/55_export_shipment_amount_try.sql`). Fatura bağlıysa (`invoiceId` dolu) DOKUNULMAZ: o andan
 * sonra `amountTry`/`exchangeRate`/`exchangeRateDate` yalnızca `linkInvoice`'ın faturadan kopyaladığı
 * değerlerle izlenir (I55-b) — asıl kaynak artık `invoices`'tır.
 */
async function syncAmountTry(tx: DbOrTx, s: typeof exportShipments.$inferSelect): Promise<typeof exportShipments.$inferSelect> {
  if (s.invoiceId) return s;
  let referenceAmount = D(s.proformaAmount);
  if (referenceAmount.lte(0)) {
    if (!s.salesOrderId) return s;
    const [order] = await tx.select({ grandTotal: salesOrders.grandTotal }).from(salesOrders).where(eq(salesOrders.id, s.salesOrderId)).limit(1);
    if (!order) return s;
    referenceAmount = D(order.grandTotal);
  }
  const effectiveDate = s.proformaDate ?? businessDate(new Date());
  let exchangeRate: Decimal;
  let exchangeRateDate: string;
  if (s.currency === 'TRY') {
    exchangeRate = D(1);
    exchangeRateDate = effectiveDate;
  } else {
    const resolved = await resolveBuyingRate(tx, s.currency, effectiveDate);
    exchangeRate = resolved?.rate ?? D(s.exchangeRate);
    exchangeRateDate = resolved?.rateDate ?? s.exchangeRateDate ?? effectiveDate;
  }
  const amountTry = round4(referenceAmount.mul(exchangeRate));
  if (exchangeRate.eq(D(s.exchangeRate)) && amountTry.eq(D(s.amountTry)) && exchangeRateDate === s.exchangeRateDate) return s;
  const [updated] = await tx
    .update(exportShipments)
    .set({ exchangeRate: toDbRate(exchangeRate), exchangeRateDate, amountTry: toDb(amountTry) })
    .where(eq(exportShipments.id, s.id))
    .returning();
  return updated!;
}

/** Sevkiyatın EUR karşılığı — yalnızca EUR siparişlerinde güvenilir; başka dövizde ETGB kontrolü atlanır (null → limit aşılmamış varsayılır, çağıran `regime` ile ezebilir). */
function estimateAmountEur(order: typeof salesOrders.$inferSelect): Decimal | null {
  if (order.currency === 'EUR') return D(order.grandTotal);
  return null;
}

async function getShipmentOrThrow(tx: DbOrTx, id: string): Promise<typeof exportShipments.$inferSelect> {
  const [row] = await tx.select().from(exportShipments).where(eq(exportShipments.id, id)).for('update');
  if (!row) throw new NotFoundError('İhracat sevkiyatı', id);
  return row;
}

function assertStatus(s: typeof exportShipments.$inferSelect, allowed: ShipmentStatus[]): void {
  if (!allowed.includes(s.status)) throw new DomainError('INVALID_SHIPMENT_STATUS', `${s.docNo} durumu (${s.status}) bu işlem için uygun değil`, { status: s.status, allowed });
}

async function findDoc(tx: DbOrTx, shipmentId: string, code: string): Promise<typeof exportDocuments.$inferSelect | null> {
  const [row] = await tx.select().from(exportDocuments).where(and(eq(exportDocuments.shipmentId, shipmentId), eq(exportDocuments.code, code))).limit(1);
  return row ?? null;
}

/**
 * Satış siparişinden sevkiyat açar (docs/INVARIANTS.md I36 kapatma yolu). Sipariş `isExport=true`
 * olmalı; zaten bir sevkiyata bağlıysa hata (1 sipariş → 1 sevkiyat, docs/modules/ihracat.md akışı).
 * Rejim verilmezse tutar/ağırlık limitine göre otomatik seçilir (ağırlık henüz bilinmiyorsa yalnızca
 * tutar kontrol edilir — çeki listesi kurulunca `buildPackingList` ağırlıkla yeniden değerlendirir).
 */
export async function createFromOrder(tx: DbOrTx, input: CreateShipmentInput, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, input.salesOrderId)).limit(1);
  if (!order) throw new NotFoundError('Satış siparişi', input.salesOrderId);
  if (order.docType !== 'order') throw new DomainError('NOT_AN_ORDER', `${order.docNo} bir sipariş değil`);
  if (!order.isExport) throw new ValidationError(`${order.docNo} ihracat siparişi değil (isExport=false)`, { orderId: order.id });
  if (order.exportShipmentId) throw new DomainError('SHIPMENT_EXISTS', `${order.docNo} zaten bir sevkiyata bağlı`, { shipmentId: order.exportShipmentId });
  const [partner] = await tx.select().from(partners).where(eq(partners.id, order.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', order.partnerId);

  const amountEur = estimateAmountEur(order);
  const check = checkEtgbLimit({ netWeightKg: null, amountEur });
  const regime = resolveRegime(input.regime ?? 'etgb', check);

  const docNo = await nextDocNo(tx, 'EXP', new Date(order.orderDate));
  // Tur 6 P1 kök neden düzeltmesi (bkz. `resolveBuyingRate`/`syncAmountTry` yorumu): `order.exchangeRate`
  // zaten `sales/orders.ts::createSalesDoc`'ta AYNI sorgu örüntüsüyle (`getExchangeRate`, 'buying',
  // orderDate'e en yakın ÖNCEKİ gün) çözülmüştür, ama o satırın GERÇEK `rate_date`'i siparişte
  // saklanmaz — eskiden burada doğrudan `order.orderDate` yazılıyordu (TCMB o gün yayın yapmamışsa
  // sevkiyat, hiç var olmayan bir kur gününe işaret ediyordu). `resolveBuyingRate` aynı sorguyu tekrar
  // çalıştırıp (`order.exchangeRate` ile normalde birebir aynı katsayıyı döner) GERÇEK `rate_date`'i de
  // verir; kur bulunamazsa (uç durum: sipariş oluşturulduktan sonra ilgili gün silindiyse) sipariş
  // değerlerine güvenli şekilde düşülür.
  const resolvedAtOrder = order.currency === 'TRY' ? null : await resolveBuyingRate(tx, order.currency, order.orderDate);
  const exchangeRate = resolvedAtOrder?.rate ?? D(order.exchangeRate);
  const exchangeRateDate = resolvedAtOrder?.rateDate ?? order.orderDate;
  const amountTry = round4(D(order.grandTotal).mul(exchangeRate));

  const [shipment] = await tx
    .insert(exportShipments)
    .values({
      docNo, status: 'draft', regime, partnerId: order.partnerId, salesOrderId: order.id,
      incoterm: input.incoterm ?? (order.incoterm as (typeof exportShipments.$inferSelect)['incoterm']) ?? 'FOB',
      incotermPlace: input.incotermPlace ?? null, currency: order.currency,
      exchangeRate: toDbRate(exchangeRate), exchangeRateDate, amountTry: toDb(amountTry),
      destinationCountry: input.destinationCountry ?? partner.country, portOfLoading: input.portOfLoading ?? null,
      portOfDischarge: input.portOfDischarge ?? null, transportMode: input.transportMode ?? null, carrier: input.carrier ?? null,
      ownerId: input.ownerId ?? ctx.userId ?? null, note: input.note ?? null, createdBy: ctx.userId ?? null,
    })
    .returning();
  const s = shipment!;

  await tx.update(salesOrders).set({ exportShipmentId: s.id, updatedBy: ctx.userId ?? null }).where(eq(salesOrders.id, order.id));
  await linkDocuments(tx, { sourceType: 'sales_order', sourceId: order.id, targetType: 'export_shipment', targetId: s.id, amount: D(order.grandTotal) }, ctx);
  await reindex(tx, s);
  await ensureDocumentSet(tx, s.id, regime, ctx);

  return s;
}

export type UpdateLogisticsInput = Partial<{
  incoterm: (typeof exportShipments.$inferSelect)['incoterm'];
  incotermPlace: string | null;
  destinationCountry: string;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  transportMode: string | null;
  carrier: string | null;
  trackingNo: string | null;
  etd: string | null;
  eta: string | null;
  note: string | null;
}>;

/** Lojistik alanlarını günceller — kapalı/iptal sevkiyatta değişiklik yapılamaz. */
export async function updateLogistics(tx: DbOrTx, shipmentId: string, input: UpdateLogisticsInput, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['draft', 'proforma_sent', 'confirmed', 'packing', 'customs', 'shipped']);
  const [updated] = await tx
    .update(exportShipments)
    .set({
      incoterm: input.incoterm ?? s.incoterm, incotermPlace: input.incotermPlace !== undefined ? input.incotermPlace : s.incotermPlace,
      destinationCountry: input.destinationCountry ?? s.destinationCountry, portOfLoading: input.portOfLoading !== undefined ? input.portOfLoading : s.portOfLoading,
      portOfDischarge: input.portOfDischarge !== undefined ? input.portOfDischarge : s.portOfDischarge,
      transportMode: input.transportMode !== undefined ? input.transportMode : s.transportMode,
      carrier: input.carrier !== undefined ? input.carrier : s.carrier, trackingNo: input.trackingNo !== undefined ? input.trackingNo : s.trackingNo,
      etd: input.etd !== undefined ? input.etd : s.etd, eta: input.eta !== undefined ? input.eta : s.eta,
      note: input.note !== undefined ? input.note : s.note, updatedBy: ctx.userId ?? null,
    })
    .where(eq(exportShipments.id, shipmentId))
    .returning();
  return updated!;
}

/**
 * Proforma üretir: PROFORMA belgesini 'sent' işaretler, `proformaNo/proformaDate/proformaAmount`
 * (siparişin GÜNCEL toplamından — satırlar değişmiş olabilir) doldurur, sevkiyatı 'proforma_sent'e
 * taşır. Gerçek PDF/e-posta gönderimi (packages/integrations) web katmanında yapılır; bu yalnızca
 * sonucu kalıcılaştırır (core → integrations bağımlılığı yok, ARCHITECTURE §1).
 */
export async function generateProforma(tx: DbOrTx, shipmentId: string, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['draft', 'proforma_sent']);
  if (!s.salesOrderId) throw new DomainError('NO_SALES_ORDER', `${s.docNo} bir siparişe bağlı değil`);
  const [order] = await tx.select().from(salesOrders).where(eq(salesOrders.id, s.salesOrderId)).limit(1);
  if (!order) throw new NotFoundError('Satış siparişi', s.salesOrderId);

  const proformaNo = s.proformaNo ?? `PF-${s.docNo}`;
  const proformaDate = businessDate(new Date());
  const [updated0] = await tx
    .update(exportShipments)
    .set({ status: 'proforma_sent', proformaNo, proformaDate, proformaAmount: order.grandTotal, updatedBy: ctx.userId ?? null })
    .where(eq(exportShipments.id, shipmentId))
    .returning();
  // I55: proformaAmount siparişin GÜNCEL toplamına çekildi — amountTry/exchangeRate'i de aynı anda
  // taze kurla yeniden yaz (kök neden: bu ikisi eskiden burada hiç senkronlanmıyordu).
  const updated = await syncAmountTry(tx, updated0!);
  await reindex(tx, updated);

  const doc = await findDoc(tx, shipmentId, 'PROFORMA');
  if (doc && doc.status !== 'not_required') {
    await updateExportDocument(tx, doc.id, { status: 'sent', docNo: proformaNo, issuedAt: proformaDate }, ctx);
  }
  return updated!;
}

/**
 * Sevkiyatı bir satış irsaliyesine bağlar (çeki listesinin kaynağı). İrsaliye aynı siparişe ait
 * olmalı. Durum 'packing'e taşınır — henüz stok/paket üretilmez, yalnızca kaynak belirlenir.
 */
export async function linkDelivery(tx: DbOrTx, shipmentId: string, deliveryId: string, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['draft', 'proforma_sent', 'confirmed', 'packing']);
  const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
  if (!delivery) throw new NotFoundError('İrsaliye', deliveryId);
  if (s.salesOrderId && delivery.salesOrderId !== s.salesOrderId) {
    throw new ValidationError(`İrsaliye ${delivery.docNo} bu sevkiyatın siparişine ait değil`, { deliveryId, expectedSalesOrderId: s.salesOrderId });
  }

  const [updated] = await tx
    .update(exportShipments)
    .set({ deliveryId, status: s.status === 'draft' || s.status === 'proforma_sent' ? 'confirmed' : s.status, updatedBy: ctx.userId ?? null })
    .where(eq(exportShipments.id, shipmentId))
    .returning();
  await linkDocuments(tx, { sourceType: 'delivery', sourceId: deliveryId, targetType: 'export_shipment', targetId: shipmentId }, ctx);
  await reindex(tx, updated!);
  return updated!;
}

/**
 * Bağlı irsaliyenin satırlarından (lot bazında) çeki listesi (`export_packages`) üretir — her satır
 * bir kap/koli olur (basitleştirilmiş: gerçek koli/palet bölünmesi operatörün elle düzenlemesine
 * bırakılır, bu yalnızca başlangıç taslağını kurar). Ağırlık `products.weightKg × qty`'den tahmin
 * edilir (yoksa 0). Toplam net ağırlık + tutar ile ETGB limiti YENİDEN değerlendirilir — sevkiyat
 * `etgb` rejiminde açılmış ama ağırlık/tutar limiti aşmışsa `standard`'a düşürülür ve belge seti
 * yeniden kurulur (docs/modules/ihracat.md "ETGB limit aşımı engellenir"). İdempotent: var olan
 * paketler silinip yeniden üretilir (irsaliye satırları değişmiş olabilir).
 */
export async function buildPackingList(tx: DbOrTx, shipmentId: string, ctx: ActorCtx): Promise<{ shipment: typeof exportShipments.$inferSelect; packages: Array<typeof exportPackages.$inferSelect> }> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['confirmed', 'packing']);
  if (!s.deliveryId) throw new DomainError('NO_DELIVERY', `${s.docNo} önce bir irsaliyeye bağlanmalı`);
  const lines = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, s.deliveryId));
  if (!lines.length) throw new ValidationError('İrsaliyede satır yok');

  await tx.delete(exportPackages).where(eq(exportPackages.shipmentId, shipmentId));

  let netTotal = ZERO;
  let grossTotal = ZERO;
  const built: Array<typeof exportPackages.$inferSelect> = [];
  let packageNo = 1;
  for (const line of lines) {
    const [product] = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1);
    const qty = D(line.pickedQty).gt(0) ? D(line.pickedQty) : D(line.qty);
    const unitWeight = product?.weightKg ? D(product.weightKg) : ZERO;
    const net = round4(unitWeight.mul(qty));
    // Ambalaj payı: brüt = net × 1.05 (kesin değer yok, `weight_kg` şemada yalnızca net taşınıyor) — operatör elle düzeltebilir.
    const gross = round4(net.mul('1.05'));
    netTotal = netTotal.plus(net);
    grossTotal = grossTotal.plus(gross);
    const [pkg] = await tx
      .insert(exportPackages)
      .values({
        shipmentId, packageNo, kind: 'carton', productId: line.productId, lotId: line.lotId ?? null, qty: toDb(qty),
        hsCode: product?.hsCode ?? null, netWeightKg: toDb(net), grossWeightKg: toDb(gross),
      })
      .returning();
    built.push(pkg!);
    packageNo += 1;
  }

  const amountEur = s.currency === 'EUR' ? D(s.proformaAmount).gt(0) ? D(s.proformaAmount) : (s.salesOrderId ? await orderGrandTotal(tx, s.salesOrderId) : null) : null;
  const check = checkEtgbLimit({ netWeightKg: netTotal, amountEur });
  const nextRegime = resolveRegime(s.regime, check);

  const [updated0] = await tx
    .update(exportShipments)
    .set({
      status: 'packing', regime: nextRegime, packageCount: built.length, palletCount: Math.ceil(built.length / 24) || null,
      netWeightKg: toDb(netTotal), grossWeightKg: toDb(grossTotal), updatedBy: ctx.userId ?? null,
    })
    .where(eq(exportShipments.id, shipmentId))
    .returning();

  if (nextRegime !== s.regime) await ensureDocumentSet(tx, shipmentId, nextRegime, ctx);
  const doc = await findDoc(tx, shipmentId, 'PACKING_LIST');
  if (doc && doc.status !== 'not_required') await updateExportDocument(tx, doc.id, { status: 'ready', issuedAt: businessDate(new Date()) }, ctx);
  // I55: çeki listesi kurulana kadar sipariş hâlâ teorik olarak değişmiş olabilir — amountTry'ı taze kurla senkronla.
  const updated = await syncAmountTry(tx, updated0!);
  await reindex(tx, updated);
  return { shipment: updated, packages: built };
}

async function orderGrandTotal(tx: DbOrTx, orderId: string): Promise<Decimal | null> {
  const [order] = await tx.select({ grandTotal: salesOrders.grandTotal }).from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  return order ? D(order.grandTotal) : null;
}

export type CustomsInput = { customsDeclarationNo?: string | null; customsDate?: string | null; etgbNo?: string | null };

/** Gümrük beyanı/ETGB numarasını işler, durumu 'customs'a taşır. */
export async function advanceToCustoms(tx: DbOrTx, shipmentId: string, input: CustomsInput, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['packing', 'customs']);
  if (s.regime === 'standard' && !input.customsDeclarationNo && !s.customsDeclarationNo) {
    throw new ValidationError('Standart rejimde gümrük beyanname no gerekli');
  }
  if (s.regime === 'etgb' && !input.etgbNo && !s.etgbNo) {
    throw new ValidationError('ETGB rejiminde ETGB no gerekli');
  }
  const [updated0] = await tx
    .update(exportShipments)
    .set({
      status: 'customs', customsDeclarationNo: input.customsDeclarationNo ?? s.customsDeclarationNo,
      customsDate: input.customsDate ?? s.customsDate ?? businessDate(new Date()), etgbNo: input.etgbNo ?? s.etgbNo,
      updatedBy: ctx.userId ?? null,
    })
    .where(eq(exportShipments.id, shipmentId))
    .returning();
  const doc = await findDoc(tx, shipmentId, s.regime === 'etgb' ? 'ETGB' : 'ATR');
  if (doc && doc.status !== 'not_required') await updateExportDocument(tx, doc.id, { status: 'received', docNo: input.etgbNo ?? input.customsDeclarationNo ?? doc.docNo, issuedAt: businessDate(new Date()) }, ctx);
  // I55: gümrüğe geçişte de fatura henüz kesilmemiştir — amountTry/exchangeRate taze senkronlanır.
  const updated = await syncAmountTry(tx, updated0!);
  await reindex(tx, updated);
  return updated;
}

/** Yüklendi — bağlı irsaliye zaten sevk edilmiş (`shipped`/`delivered`) olmalı (asıl stok hareketi orada işlenir). */
export async function markShipped(tx: DbOrTx, shipmentId: string, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['customs', 'packing']);
  if (s.deliveryId) {
    const [delivery] = await tx.select({ status: deliveries.status }).from(deliveries).where(eq(deliveries.id, s.deliveryId)).limit(1);
    if (!delivery || !['shipped', 'delivered'].includes(delivery.status)) {
      throw new DomainError('DELIVERY_NOT_SHIPPED', 'Bağlı irsaliye henüz sevk edilmedi — önce depo tarafında sevk edin');
    }
  }
  const [updated0] = await tx.update(exportShipments).set({ status: 'shipped', updatedBy: ctx.userId ?? null }).where(eq(exportShipments.id, shipmentId)).returning();
  const updated = await syncAmountTry(tx, updated0!);
  await reindex(tx, updated);
  return updated;
}

/** Teslim edildi (alıcıya). */
export async function markShipmentDelivered(tx: DbOrTx, shipmentId: string, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['shipped']);
  const [updated0] = await tx.update(exportShipments).set({ status: 'delivered', updatedBy: ctx.userId ?? null }).where(eq(exportShipments.id, shipmentId)).returning();
  const updated = await syncAmountTry(tx, updated0!);
  await reindex(tx, updated);
  return updated;
}

/**
 * İhracat faturasını sevkiyata bağlar (Fatura & Kur sekmesi) — `invoices.exportShipmentId` doldurulur,
 * `document_links(export_shipment→invoice)` kurulur (I36 `export_shipment_orphan_invoice` kapsamı).
 * Fatura zaten `createInvoiceFromOrder/FromDelivery` (isExport siparişten KDV %0 ile) tarafından
 * oluşturulmuş olmalı — burada YENİ bir fatura ÜRETİLMEZ (tek fatura yazma noktası `sales/invoicing.ts`).
 *
 * Tur 6 P1 kök neden düzeltmesi: UI yalnızca status IN ('shipped','delivered') iken "Faturaya bağla"
 * düğmesini gösteriyordu (`canLinkInvoice`) ama core'da karşılığı yoktu — `assertStatus` eklendi (savunma
 * katmanı UI'de kaldırılsa/atlansa bile sunucu tarafı korur, diğer tüm durum geçişleriyle aynı desen).
 * Ayrıca `s.invoiceId` zaten doluyken kontrolsüz üzerine yazılıyordu: eski faturanın `exportShipmentId`'si
 * temizlenmeden yeni fatura yazılınca `document_links`'te eski+yeni iki satır kalıyor, eski fatura hâlâ
 * bu sevkiyatı gösteriyordu (mandate #5 belge zinciri simetrisi ihlali — I44'ün `cancelShipment`'e
 * kazandırdığı simetrik temizleme örüntüsü burada yoktu). Aynı faturayla tekrar çağrı (idempotent) hâlâ
 * serbest; FARKLI bir faturayla ikinci çağrı reddedilir — önce `cancelShipment`/manuel temizlik gerekir.
 */
export async function linkInvoice(tx: DbOrTx, shipmentId: string, invoiceId: string, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['shipped', 'delivered']);
  if (s.invoiceId && s.invoiceId !== invoiceId) {
    throw new DomainError('INVOICE_ALREADY_LINKED', `${s.docNo} zaten başka bir faturaya (${s.invoiceId}) bağlı — önce o bağlantı kaldırılmalı`, { shipmentId, existingInvoiceId: s.invoiceId, invoiceId });
  }
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new NotFoundError('Fatura', invoiceId);
  if (!invoice.isExport) throw new ValidationError(`Fatura ${invoice.docNo} ihracat faturası değil`, { invoiceId });
  if (s.salesOrderId && invoice.salesOrderId !== s.salesOrderId) {
    throw new ValidationError(`Fatura ${invoice.docNo} bu sevkiyatın siparişine ait değil`, { invoiceId, expectedSalesOrderId: s.salesOrderId });
  }

  const [updated] = await tx
    .update(exportShipments)
    .set({
      invoiceId, exchangeRate: invoice.exchangeRate, exchangeRateDate: invoice.invoiceDate,
      amountTry: invoice.grandTotalTry, updatedBy: ctx.userId ?? null,
    })
    .where(eq(exportShipments.id, shipmentId))
    .returning();
  await tx.update(invoices).set({ exportShipmentId: shipmentId }).where(eq(invoices.id, invoiceId));
  await linkDocuments(tx, { sourceType: 'export_shipment', sourceId: shipmentId, targetType: 'invoice', targetId: invoiceId, amount: D(invoice.grandTotal) }, ctx);

  const doc = await findDoc(tx, shipmentId, 'INVOICE');
  if (doc && doc.status !== 'not_required') await updateExportDocument(tx, doc.id, { status: 'sent', docNo: invoice.docNo, issuedAt: invoice.invoiceDate }, ctx);
  await reindex(tx, updated!);
  return updated!;
}

/** Kapanış — fatura bağlı ve teslim edilmiş olmalı (tahsilat/kur farkı zaten `recordPayment`'te işlenmiştir). */
export async function closeShipment(tx: DbOrTx, shipmentId: string, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['shipped', 'delivered']);
  if (!s.invoiceId) throw new DomainError('NO_INVOICE', `${s.docNo} kapanmadan önce bir faturaya bağlanmalı`);
  const [updated] = await tx.update(exportShipments).set({ status: 'closed', updatedBy: ctx.userId ?? null }).where(eq(exportShipments.id, shipmentId)).returning();
  await reindex(tx, updated!);
  return updated!;
}

/**
 * İptal — henüz yüklenmemiş sevkiyatlar için. `linkInvoice`'ın kendi `assertStatus` kısıtı
 * olmadığından (draft..customs arası herhangi bir durumda gerçek bir faturaya bağlanabilir),
 * iptal edilen sevkiyatın kendi `invoiceId`/`deliveryId` alanları VE karşı taraftaki
 * `invoices.exportShipmentId` de burada temizlenir (docs/INVARIANTS.md I44) — aksi halde
 * iptal edilmiş bir sevkiyat kaydına, hâlâ gerçek/ödenmiş bir fatura üzerinden geri işaret
 * eden bir belge zinciri kalır (mandate #5 ihlali). `salesOrders.exportShipmentId` için zaten
 * uygulanan temizleme örüntüsü burada `invoiceId`/`deliveryId` için de tekrarlanır.
 */
export async function cancelShipment(tx: DbOrTx, shipmentId: string, reason: string | null, ctx: ActorCtx): Promise<typeof exportShipments.$inferSelect> {
  const s = await getShipmentOrThrow(tx, shipmentId);
  assertStatus(s, ['draft', 'proforma_sent', 'confirmed', 'packing', 'customs']);
  const [updated] = await tx
    .update(exportShipments)
    .set({
      status: 'cancelled', invoiceId: null, deliveryId: null,
      note: reason ? `${s.note ? `${s.note}\n` : ''}İptal: ${reason}` : s.note, updatedBy: ctx.userId ?? null,
    })
    .where(eq(exportShipments.id, shipmentId))
    .returning();
  if (s.salesOrderId) await tx.update(salesOrders).set({ exportShipmentId: null }).where(eq(salesOrders.id, s.salesOrderId));
  if (s.invoiceId) await tx.update(invoices).set({ exportShipmentId: null }).where(eq(invoices.id, s.invoiceId));
  await reindex(tx, updated!);
  return updated!;
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db, parseAnaVeri, importAnaVeri } from '@plantero/db';
import {
  createProduct, updateProduct, addProductBarcode, removeProductBarcode, addSkuSegment,
  suggestNextSku, suggestShortCode,
  createPartner, updatePartner, addPartnerAddress, addPartnerContact, upsertSupplierProduct,
  createBomVersion, updateBomDraft, activateBom, archiveBom,
  createLocation, updateLocation,
} from '@plantero/core';
import { requirePermission } from '@/lib/auth';
import { withAudit, type ActionResult } from '@/lib/actions';
import { buildImportPreview, type ImportPreviewSummary } from './queries';

/* ==================================================================== */
/* Ürünler                                                              */
/* ==================================================================== */

const createProductSchema = z.object({
  sku: z.string().regex(/^\d{9}$/, 'SKU 9 haneli olmalı'),
  shortCode: z.string().trim().optional().nullable(),
  name: z.string().trim().min(2, 'Ürün adı gerekli'),
  type: z.enum(['finished', 'semi_finished', 'raw_material', 'packaging', 'merchandise', 'equipment', 'fixed_asset', 'service']),
  category1: z.string().trim().optional().nullable(),
  category2: z.string().trim().optional().nullable(),
  category3: z.string().trim().optional().nullable(),
  variant: z.string().trim().optional().nullable(),
  packaging: z.string().trim().optional().nullable(),
  packQty: z.coerce.number().int().min(1).default(1),
  uomId: z.string().uuid('Birim seçin'),
  barcode: z.string().trim().optional().nullable(),
  isLotTracked: z.coerce.boolean().default(true),
  isPurchasable: z.coerce.boolean().default(false),
  isSellable: z.coerce.boolean().default(false),
  isManufactured: z.coerce.boolean().default(false),
  shelfLifeDays: z.coerce.number().int().min(0).optional().nullable(),
  requiresIncomingQc: z.coerce.boolean().default(false),
  quarantineDays: z.coerce.number().int().min(0).default(0),
  vatRate: z.string().default('1'),
  purchaseVatRate: z.string().default('20'),
  listPrice: z.string().default('0'),
  minQty: z.string().optional().nullable(),
  maxQty: z.string().optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  preferredSupplierId: z.string().uuid().optional().nullable(),
  supplierPrice: z.string().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export const createProductAction = withAudit('masterdata.createProduct', async (raw: z.input<typeof createProductSchema>) => {
  await requirePermission('masterdata.manage');
  const input = createProductSchema.parse(raw);
  const product = await db.transaction(async (tx) => {
    const p = await createProduct(tx, {
      sku: input.sku,
      shortCode: input.shortCode || null,
      name: input.name,
      type: input.type,
      category1: input.category1 || null,
      category2: input.category2 || null,
      category3: input.category3 || null,
      variant: input.variant || null,
      packaging: input.packaging || null,
      packQty: input.packQty,
      uomId: input.uomId,
      barcode: input.barcode || null,
      isLotTracked: input.isLotTracked,
      isPurchasable: input.isPurchasable,
      isSellable: input.isSellable,
      isManufactured: input.isManufactured,
      shelfLifeDays: input.shelfLifeDays ?? null,
      requiresIncomingQc: input.requiresIncomingQc,
      quarantineDays: input.quarantineDays,
      vatRate: input.vatRate,
      purchaseVatRate: input.purchaseVatRate,
      listPrice: input.listPrice,
      minQty: input.minQty || null,
      maxQty: input.maxQty || null,
      leadTimeDays: input.leadTimeDays ?? null,
      note: input.note || null,
    });
    if (input.preferredSupplierId && input.supplierPrice) {
      await upsertSupplierProduct(tx, { partnerId: input.preferredSupplierId, productId: p.id, price: input.supplierPrice, isPreferred: true });
    }
    return p;
  });
  revalidatePath('/ana-veri/urunler');
  return { data: { id: product.id, sku: product.sku }, audit: { action: 'create', tableName: 'products', recordId: product.id, summary: `Ürün oluşturuldu: ${product.sku} — ${product.name}`, after: product } };
});

const updateProductSchema = z.object({
  id: z.string().uuid(),
  shortCode: z.string().trim().optional().nullable(),
  category1: z.string().trim().optional().nullable(),
  category2: z.string().trim().optional().nullable(),
  category3: z.string().trim().optional().nullable(),
  variant: z.string().trim().optional().nullable(),
  packaging: z.string().trim().optional().nullable(),
  packQty: z.coerce.number().int().min(1).optional(),
  caseBarcode: z.string().trim().optional().nullable(),
  isLotTracked: z.coerce.boolean().optional(),
  isPurchasable: z.coerce.boolean().optional(),
  isSellable: z.coerce.boolean().optional(),
  isManufactured: z.coerce.boolean().optional(),
  costMethod: z.enum(['lot', 'average', 'standard']).optional(),
  shelfLifeDays: z.coerce.number().int().min(0).optional().nullable(),
  alertDaysBeforeExpiry: z.coerce.number().int().min(0).optional().nullable(),
  removalDaysBeforeExpiry: z.coerce.number().int().min(0).optional().nullable(),
  requiresIncomingQc: z.coerce.boolean().optional(),
  quarantineDays: z.coerce.number().int().min(0).optional(),
  vatRate: z.string().optional(),
  purchaseVatRate: z.string().optional(),
  listPrice: z.string().optional(),
  weightKg: z.string().optional().nullable(),
  hsCode: z.string().trim().optional().nullable(),
  minQty: z.string().optional().nullable(),
  maxQty: z.string().optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  note: z.string().trim().optional().nullable(),
  status: z.enum(['active', 'cancelled', 'draft']).optional(),
});

export const updateProductAction = withAudit('masterdata.updateProduct', async (raw: z.input<typeof updateProductSchema>) => {
  await requirePermission('masterdata.manage');
  const { id, ...input } = updateProductSchema.parse(raw);
  const row = await db.transaction((tx) => updateProduct(tx, id, input));
  revalidatePath(`/ana-veri/urunler/${id}`);
  revalidatePath('/ana-veri/urunler');
  return { data: row, audit: { action: 'update', tableName: 'products', recordId: id, summary: `Ürün güncellendi: ${row.sku}`, after: row } };
});

const changeIdentitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).optional(),
  barcode: z.string().trim().optional().nullable(),
  reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı'),
});

/** Ad/barkod değişikliği — yalnızca admin.settings, gerekçe zorunlu, audit'e gerekçe yazılır. */
export const changeProductIdentityAction = withAudit('masterdata.changeProductIdentity', async (raw: z.input<typeof changeIdentitySchema>) => {
  await requirePermission('admin.settings');
  const input = changeIdentitySchema.parse(raw);
  const before = await db.query.products.findFirst({ where: (p, { eq }) => eq(p.id, input.id) });
  const row = await db.transaction((tx) =>
    updateProduct(tx, input.id, { name: input.name, barcode: input.barcode }, { allowIdentityChange: true, reason: input.reason }),
  );
  revalidatePath(`/ana-veri/urunler/${input.id}`);
  return {
    data: row,
    audit: {
      action: 'update',
      tableName: 'products',
      recordId: input.id,
      summary: `Ürün kimliği değiştirildi (${row.sku}) — gerekçe: ${input.reason}`,
      before,
      after: row,
    },
  };
});

const addBarcodeSchema = z.object({ productId: z.string().uuid(), barcode: z.string().trim().min(3), kind: z.enum(['unit', 'case', 'pallet', 'extra']).default('extra'), note: z.string().trim().optional().nullable() });

export const addProductBarcodeAction = withAudit('masterdata.addProductBarcode', async (raw: z.input<typeof addBarcodeSchema>) => {
  await requirePermission('masterdata.manage');
  const input = addBarcodeSchema.parse(raw);
  const row = await db.transaction((tx) => addProductBarcode(tx, input));
  revalidatePath(`/ana-veri/urunler/${input.productId}`);
  return { data: row, audit: { action: 'update', tableName: 'products', recordId: input.productId, summary: `Ek barkod eklendi: ${input.barcode}`, after: row } };
});

const removeBarcodeSchema = z.object({ id: z.string().uuid(), productId: z.string().uuid() });

export const removeProductBarcodeAction = withAudit('masterdata.removeProductBarcode', async (raw: z.input<typeof removeBarcodeSchema>) => {
  await requirePermission('masterdata.manage');
  const input = removeBarcodeSchema.parse(raw);
  await db.transaction((tx) => removeProductBarcode(tx, input.id));
  revalidatePath(`/ana-veri/urunler/${input.productId}`);
  return { data: { id: input.id }, audit: { action: 'delete', tableName: 'products', recordId: input.productId, summary: 'Ek barkod silindi' } };
});

/* SKU sihirbazı: önizleme (yazma yapmaz — audit gerekmiyor, düz async fonksiyon) */
const skuSuggestSchema = z.object({ t: z.string().length(1), aa: z.string().length(2), bb: z.string().length(2), cc: z.string().length(2), preferredPP: z.string().length(2).optional() });

export async function suggestSkuAction(raw: z.input<typeof skuSuggestSchema>): Promise<ActionResult<{ sku: string; conflict: boolean }>> {
  try {
    await requirePermission('masterdata.view');
    const input = skuSuggestSchema.parse(raw);
    const result = await suggestNextSku(db, input, { preferredPP: input.preferredPP });
    return { ok: true, data: { sku: result.sku, conflict: result.conflict } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Beklenmeyen hata' };
  }
}

const shortCodeSuggestSchema = z.object({ type: z.string(), category2: z.string().optional().nullable(), category3: z.string().optional().nullable() });

export async function suggestShortCodeAction(raw: z.input<typeof shortCodeSuggestSchema>): Promise<ActionResult<{ shortCode: string }>> {
  try {
    await requirePermission('masterdata.view');
    const input = shortCodeSuggestSchema.parse(raw);
    const shortCode = await suggestShortCode(db, input);
    return { ok: true, data: { shortCode } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Beklenmeyen hata' };
  }
}

const addSegmentSchema = z.object({ segment: z.enum(['T', 'AA', 'BB', 'CC', 'PP']), context: z.string().trim().optional().nullable(), code: z.string().trim().min(1), label: z.string().trim().min(1), isReserved: z.coerce.boolean().default(false) });

export const addSkuSegmentAction = withAudit('masterdata.addSkuSegment', async (raw: z.input<typeof addSegmentSchema>) => {
  await requirePermission('masterdata.manage');
  const input = addSegmentSchema.parse(raw);
  const row = await db.transaction((tx) => addSkuSegment(tx, input));
  revalidatePath('/ana-veri/kod-yapisi');
  return { data: row, audit: { action: 'create', tableName: 'sku_segments', recordId: row.id, summary: `Kod segmenti eklendi: ${input.segment}/${input.code}`, after: row } };
});

/* ==================================================================== */
/* Cariler                                                              */
/* ==================================================================== */

const createPartnerSchema = z.object({
  name: z.string().trim().min(2),
  kind: z.enum(['customer', 'supplier', 'both', 'bank', 'other']),
  taxNumber: z.string().trim().optional().nullable(),
  taxOffice: z.string().trim().optional().nullable(),
  isEInvoiceRegistered: z.coerce.boolean().default(false),
  email: z.string().trim().email().optional().or(z.literal('')).nullable(),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  country: z.string().default('TR'),
  currency: z.string().default('TRY'),
  paymentTermKind: z.enum(['cash', 'days', 'marketplace_cycle']).default('cash'),
  paymentTermDays: z.coerce.number().int().min(0).default(0),
  defaultChannelId: z.string().uuid().optional().nullable(),
  priceListId: z.string().uuid().optional().nullable(),
  supplierLeadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  isPurchaseWhitelisted: z.coerce.boolean().default(false),
  note: z.string().trim().optional().nullable(),
});

export const createPartnerAction = withAudit('masterdata.createPartner', async (raw: z.input<typeof createPartnerSchema>) => {
  await requirePermission('masterdata.manage');
  const input = createPartnerSchema.parse(raw);
  const row = await db.transaction((tx) => createPartner(tx, { ...input, email: input.email || null }));
  revalidatePath('/ana-veri/cariler');
  return { data: row, audit: { action: 'create', tableName: 'partners', recordId: row.id, summary: `Cari oluşturuldu: ${row.code} — ${row.name}`, after: row } };
});

const updatePartnerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).optional(),
  taxNumber: z.string().trim().optional().nullable(),
  taxOffice: z.string().trim().optional().nullable(),
  isEInvoiceRegistered: z.coerce.boolean().optional(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  paymentTermKind: z.enum(['cash', 'days', 'marketplace_cycle']).optional(),
  paymentTermDays: z.coerce.number().int().min(0).optional(),
  creditLimit: z.string().optional().nullable(),
  defaultChannelId: z.string().uuid().optional().nullable(),
  priceListId: z.string().uuid().optional().nullable(),
  supplierLeadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  isPurchaseWhitelisted: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  note: z.string().trim().optional().nullable(),
});

export const updatePartnerAction = withAudit('masterdata.updatePartner', async (raw: z.input<typeof updatePartnerSchema>) => {
  await requirePermission('masterdata.manage');
  const { id, ...input } = updatePartnerSchema.parse(raw);
  const row = await db.transaction((tx) => updatePartner(tx, id, input));
  revalidatePath(`/ana-veri/cariler/${id}`);
  revalidatePath('/ana-veri/cariler');
  return { data: row, audit: { action: 'update', tableName: 'partners', recordId: id, summary: `Cari güncellendi: ${row.code}`, after: row } };
});

const addAddressSchema = z.object({ partnerId: z.string().uuid(), kind: z.enum(['billing', 'shipping', 'both']).default('billing'), label: z.string().trim().optional().nullable(), line1: z.string().trim().min(2), line2: z.string().trim().optional().nullable(), district: z.string().trim().optional().nullable(), city: z.string().trim().optional().nullable(), postalCode: z.string().trim().optional().nullable(), country: z.string().default('TR'), isDefault: z.coerce.boolean().default(false) });

export const addPartnerAddressAction = withAudit('masterdata.addPartnerAddress', async (raw: z.input<typeof addAddressSchema>) => {
  await requirePermission('masterdata.manage');
  const input = addAddressSchema.parse(raw);
  const row = await db.transaction((tx) => addPartnerAddress(tx, input));
  revalidatePath(`/ana-veri/cariler/${input.partnerId}`);
  return { data: row, audit: { action: 'create', tableName: 'partner_addresses', recordId: row.id, summary: 'Adres eklendi', after: row } };
});

const addContactSchema = z.object({ partnerId: z.string().uuid(), fullName: z.string().trim().min(2), title: z.string().trim().optional().nullable(), email: z.string().trim().optional().nullable(), phone: z.string().trim().optional().nullable(), whatsapp: z.string().trim().optional().nullable(), isPrimary: z.coerce.boolean().default(false) });

export const addPartnerContactAction = withAudit('masterdata.addPartnerContact', async (raw: z.input<typeof addContactSchema>) => {
  await requirePermission('masterdata.manage');
  const input = addContactSchema.parse(raw);
  const row = await db.transaction((tx) => addPartnerContact(tx, input));
  revalidatePath(`/ana-veri/cariler/${input.partnerId}`);
  return { data: row, audit: { action: 'create', tableName: 'partner_contacts', recordId: row.id, summary: `Kişi eklendi: ${input.fullName}`, after: row } };
});

const upsertSupplierProductSchema = z.object({ partnerId: z.string().uuid(), productId: z.string().uuid(), supplierSku: z.string().trim().optional().nullable(), price: z.string(), leadTimeDays: z.coerce.number().int().min(0).default(7), minOrderQty: z.string().default('0'), isPreferred: z.coerce.boolean().default(false) });

export const upsertSupplierProductAction = withAudit('masterdata.upsertSupplierProduct', async (raw: z.input<typeof upsertSupplierProductSchema>) => {
  await requirePermission('masterdata.manage');
  const input = upsertSupplierProductSchema.parse(raw);
  const row = await db.transaction((tx) => upsertSupplierProduct(tx, input));
  revalidatePath(`/ana-veri/cariler/${input.partnerId}`);
  revalidatePath(`/ana-veri/urunler/${input.productId}`);
  return { data: row, audit: { action: 'update', tableName: 'supplier_products', recordId: row.id, summary: 'Tedarikçi ürün fiyatı güncellendi', after: row } };
});

/* ==================================================================== */
/* Reçeteler (BOM)                                                      */
/* ==================================================================== */

const bomLineSchema = z.object({ productId: z.string().uuid(), qty: z.string(), uomId: z.string().uuid(), scrapPct: z.string().default('0'), isByproduct: z.coerce.boolean().default(false), sequence: z.coerce.number().int().default(10) });

const createBomSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().optional().nullable(),
  outputQty: z.string().default('1'),
  outputUomId: z.string().uuid().optional().nullable(),
  expectedYieldPct: z.string().default('100'),
  cycleMinutes: z.coerce.number().int().optional().nullable(),
  defaultLineId: z.string().uuid().optional().nullable(),
  overheadPerBatch: z.string().default('0'),
  overheadPerUnit: z.string().default('0'),
  note: z.string().trim().optional().nullable(),
  lines: z.array(bomLineSchema).min(1, 'En az bir satır gerekli'),
  activate: z.coerce.boolean().default(false),
});

export const createBomVersionAction = withAudit('masterdata.createBomVersion', async (raw: z.input<typeof createBomSchema>) => {
  await requirePermission('masterdata.manage');
  const { activate, ...input } = createBomSchema.parse(raw);
  const bom = await db.transaction(async (tx) => {
    const row = await createBomVersion(tx, input);
    if (activate) return activateBom(tx, row.id);
    return row;
  });
  revalidatePath(`/ana-veri/receteler/${bom.id}`);
  revalidatePath('/ana-veri/receteler');
  return { data: bom, audit: { action: 'create', tableName: 'boms', recordId: bom.id, summary: `Reçete oluşturuldu: ${bom.code}`, after: bom } };
});

const updateBomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().optional().nullable(),
  outputQty: z.string().optional(),
  outputUomId: z.string().uuid().optional().nullable(),
  expectedYieldPct: z.string().optional(),
  cycleMinutes: z.coerce.number().int().optional().nullable(),
  defaultLineId: z.string().uuid().optional().nullable(),
  overheadPerBatch: z.string().optional(),
  overheadPerUnit: z.string().optional(),
  note: z.string().trim().optional().nullable(),
  lines: z.array(bomLineSchema).optional(),
});

export const updateBomDraftAction = withAudit('masterdata.updateBomDraft', async (raw: z.input<typeof updateBomSchema>) => {
  await requirePermission('masterdata.manage');
  const { id, ...input } = updateBomSchema.parse(raw);
  const row = await db.transaction((tx) => updateBomDraft(tx, id, input));
  revalidatePath(`/ana-veri/receteler/${id}`);
  return { data: row, audit: { action: 'update', tableName: 'boms', recordId: id, summary: `Reçete taslağı güncellendi: ${row.code}`, after: row } };
});

const bomIdSchema = z.object({ id: z.string().uuid() });

export const activateBomAction = withAudit('masterdata.activateBom', async (raw: z.input<typeof bomIdSchema>) => {
  await requirePermission('masterdata.manage');
  const { id } = bomIdSchema.parse(raw);
  const row = await db.transaction((tx) => activateBom(tx, id));
  revalidatePath(`/ana-veri/receteler/${id}`);
  revalidatePath('/ana-veri/receteler');
  return { data: row, audit: { action: 'approve', tableName: 'boms', recordId: id, summary: `Reçete aktifleştirildi: ${row.code}`, after: row } };
});

export const archiveBomAction = withAudit('masterdata.archiveBom', async (raw: z.input<typeof bomIdSchema>) => {
  await requirePermission('masterdata.manage');
  const { id } = bomIdSchema.parse(raw);
  const row = await db.transaction((tx) => archiveBom(tx, id));
  revalidatePath(`/ana-veri/receteler/${id}`);
  revalidatePath('/ana-veri/receteler');
  return { data: row, audit: { action: 'update', tableName: 'boms', recordId: id, summary: `Reçete arşivlendi: ${row.code}`, after: row } };
});

/* ==================================================================== */
/* Depolar / lokasyonlar                                                */
/* ==================================================================== */

const createLocationSchema = z.object({
  warehouseId: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  segment: z.string().trim().min(1),
  name: z.string().trim().min(1),
  usage: z.enum(['internal', 'quarantine', 'rejected', 'production', 'supplier', 'customer', 'inventory_loss', 'scrap', 'transit', 'view']),
  aisle: z.string().trim().optional().nullable(),
  rack: z.string().trim().optional().nullable(),
  shelf: z.string().trim().optional().nullable(),
  isPickable: z.coerce.boolean().default(true),
});

export const createLocationAction = withAudit('masterdata.createLocation', async (raw: z.input<typeof createLocationSchema>) => {
  await requirePermission('masterdata.manage');
  const input = createLocationSchema.parse(raw);
  const row = await db.transaction((tx) => createLocation(tx, input));
  revalidatePath('/ana-veri/depolar');
  return { data: row, audit: { action: 'create', tableName: 'locations', recordId: row.id, summary: `Lokasyon oluşturuldu: ${row.code}`, after: row } };
});

const updateLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().optional(),
  usage: z.enum(['internal', 'quarantine', 'rejected', 'production', 'supplier', 'customer', 'inventory_loss', 'scrap', 'transit', 'view']).optional(),
  barcode: z.string().trim().optional().nullable(),
  isPickable: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const updateLocationAction = withAudit('masterdata.updateLocation', async (raw: z.input<typeof updateLocationSchema>) => {
  await requirePermission('masterdata.manage');
  const { id, ...input } = updateLocationSchema.parse(raw);
  const row = await db.transaction((tx) => updateLocation(tx, id, input));
  revalidatePath('/ana-veri/depolar');
  return { data: row, audit: { action: 'update', tableName: 'locations', recordId: id, summary: `Lokasyon güncellendi: ${row.code}`, after: row } };
});

/* ==================================================================== */
/* Excel içe aktarım sihirbazı                                          */
/* ==================================================================== */

export type ImportPreview = Awaited<ReturnType<typeof parseAnaVeri>> & {
  dryRun: Awaited<ReturnType<typeof importAnaVeri>>;
  diff: ImportPreviewSummary;
};

/** Dosyayı ayrıştırır + kuru çalıştırma (yazmaz) yapar; önizleme tablosunu (diff dahil) besler. */
export async function previewImportAction(formData: FormData): Promise<ActionResult<ImportPreview>> {
  try {
    await requirePermission('masterdata.manage');
    const file = formData.get('file');
    if (!(file instanceof File)) return { ok: false, error: 'Dosya seçilmedi' };
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseAnaVeri(buffer);
    const [dryRun, diff] = await Promise.all([importAnaVeri(db, parsed, { dryRun: true }), buildImportPreview(parsed)]);
    return { ok: true, data: { ...parsed, dryRun, diff } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'İçe aktarım önizlemesi başarısız' };
  }
}

/** Önizlemesi onaylanan dosyayı gerçekten uygular (yazar) — audit satırı düşer. */
export async function applyImportAction(formData: FormData): Promise<ActionResult<Awaited<ReturnType<typeof importAnaVeri>>>> {
  const user = await requirePermission('masterdata.manage').catch(() => null);
  if (!user) return { ok: false, error: 'Bu işlem için yetkiniz yok.' };
  try {
    const file = formData.get('file');
    if (!(file instanceof File)) return { ok: false, error: 'Dosya seçilmedi' };
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseAnaVeri(buffer);
    const result = await db.transaction((tx) => importAnaVeri(tx, parsed));
    const { writeAudit } = await import('@plantero/core');
    await writeAudit(
      db,
      {
        action: 'import',
        tableName: 'products',
        summary: `Ana Veri Excel içe aktarımı: ${result.created} yeni, ${result.updated} güncellendi, ${result.unchanged} değişmedi, ${result.conflicts.length} çakışma`,
        after: result,
      },
      user.actor,
    );
    revalidatePath('/ana-veri/urunler');
    revalidatePath('/ana-veri/import');
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'İçe aktarım uygulanamadı' };
  }
}

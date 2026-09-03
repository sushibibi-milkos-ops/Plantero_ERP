import { and, asc, eq, like, ne } from 'drizzle-orm';
import { products, productBarcodes, productCategories, skuSegments, type DbOrTx } from '@plantero/db';
import { DomainError, NotFoundError, ValidationError } from '../auth/errors.js';

/**
 * Ürün ana verisi — konuşan kod (SKU) T·AA·BB·CC·PP (9 hane).
 * KURAL: Ürün adı ve barkod oluşturulduktan sonra kilitlenir. `updateProduct` bu iki alanı
 * yalnızca `opts.allowIdentityChange=true` (admin.settings) VE bir `reason` verildiğinde değiştirir.
 */

export type SkuParts = { t: string; aa: string; bb: string; cc: string; pp: string };

/** 9 haneli SKU'yu T(1)·AA(2)·BB(2)·CC(2)·PP(2) parçalarına ayırır; format uymuyorsa null. */
export function parseSku(sku: string): SkuParts | null {
  const s = (sku ?? '').trim();
  if (!/^\d{9}$/.test(s)) return null;
  return { t: s.slice(0, 1), aa: s.slice(1, 3), bb: s.slice(3, 5), cc: s.slice(5, 7), pp: s.slice(7, 9) };
}

export type SkuValidation = { valid: boolean; errors: string[] };

/** Biçim doğrulaması: 9 hane, T hanesi tanınan bir tip kodu (1/2/3/4/8/9). */
export function validateSku(sku: string): SkuValidation {
  const errors: string[] = [];
  const parts = parseSku(sku);
  if (!parts) {
    errors.push('SKU 9 haneli sayısal bir kod olmalı (T·AA·BB·CC·PP)');
    return { valid: false, errors };
  }
  if (!['1', '2', '3', '4', '8', '9'].includes(parts.t)) errors.push(`Tanınmayan T (tip) hanesi: ${parts.t}`);
  return { valid: errors.length === 0, errors };
}

/** EAN-13 checksum doğrulaması (GS1 mod-10). 13 haneden farklı uzunlukta ise false. */
export function isValidEan13(code: string | null | undefined): boolean {
  if (!code) return false;
  const s = code.trim();
  if (!/^\d{13}$/.test(s)) return false;
  const digits = s.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

/** Verilen SKU'nun kullanımda olup olmadığı. */
export async function isSkuTaken(tx: DbOrTx, sku: string, excludeId?: string): Promise<boolean> {
  const where = excludeId ? and(eq(products.sku, sku), ne(products.id, excludeId)) : eq(products.sku, sku);
  const [row] = await tx.select({ id: products.id }).from(products).where(where).limit(1);
  return Boolean(row);
}

/**
 * Aynı T·AA·BB·CC altında sıradaki boş PP kodunu önerir.
 * Önce `preferredPP` (seçilen ambalaj kodu) denenir; doluysa mevcutların en büyüğü + 1 kullanılır (99'a kadar).
 */
export async function suggestNextSku(
  tx: DbOrTx,
  parts: { t: string; aa: string; bb: string; cc: string },
  opts: { preferredPP?: string } = {},
): Promise<{ sku: string; pp: string; existingCount: number; conflict: boolean }> {
  const prefix7 = `${parts.t}${parts.aa}${parts.bb}${parts.cc}`;
  if (!/^\d{7}$/.test(prefix7)) throw new ValidationError('T·AA·BB·CC segmentleri 7 haneli sayısal olmalı');

  const rows = await tx.select({ sku: products.sku }).from(products).where(like(products.sku, `${prefix7}%`));
  const takenPP = new Set(rows.map((r) => r.sku.slice(7, 9)));

  const tryPP = (pp: string) => !takenPP.has(pp);

  if (opts.preferredPP && /^\d{2}$/.test(opts.preferredPP) && tryPP(opts.preferredPP)) {
    return { sku: `${prefix7}${opts.preferredPP}`, pp: opts.preferredPP, existingCount: rows.length, conflict: false };
  }

  const maxPP = rows.length ? Math.max(...Array.from(takenPP, (p) => Number(p) || 0)) : 0;
  for (let n = maxPP + 1; n <= 99; n++) {
    const pp = String(n).padStart(2, '0');
    if (tryPP(pp)) return { sku: `${prefix7}${pp}`, pp, existingCount: rows.length, conflict: false };
  }
  // 99'a kadar hepsi dolu — 01'den tara (boşluk kalmışsa)
  for (let n = 1; n <= 99; n++) {
    const pp = String(n).padStart(2, '0');
    if (tryPP(pp)) return { sku: `${prefix7}${pp}`, pp, existingCount: rows.length, conflict: false };
  }
  return { sku: `${prefix7}99`, pp: '99', existingCount: rows.length, conflict: true };
}

const SHORT_PREFIX_BY_TYPE: Record<string, string> = {
  finished: 'PLT',
  semi_finished: 'PLT',
  raw_material: 'HAM',
  packaging: 'AMB',
  merchandise: 'TCR',
  equipment: 'EKP',
  fixed_asset: 'DMB',
  service: 'HZM',
};

const TR_UPPER = (s: string) => s.toLocaleUpperCase('tr-TR');
const STRIP_TR = (s: string) =>
  s.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');

/** Kategori/varyant adından 3 harflik kısaltma üretir: "Kuruyemiş Hammaddeleri" → "KYM" */
export function abbreviate(text: string | null | undefined, length = 3): string {
  const cleaned = STRIP_TR(TR_UPPER((text ?? '').trim())).replace(/[^A-Z0-9\s]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'GEN';
  if (words.length === 1) return words[0]!.slice(0, length).padEnd(length, 'X');
  let out = words.map((w) => w.charAt(0)).join('').slice(0, length);
  if (out.length < length) out += words[0]!.slice(1, length - out.length + 1);
  return out.padEnd(length, 'X').slice(0, length);
}

/**
 * Boş kısa kod önerisi: `<TİP>-<kategori kısaltması>-<sıra>` (ör. HAM-KYM-01).
 * Mevcut kısa kodlar taranarak aynı önek altındaki en büyük sıra + 1 verilir.
 */
export async function suggestShortCode(
  tx: DbOrTx,
  input: { type: string; category2?: string | null; category3?: string | null },
): Promise<string> {
  const prefix = SHORT_PREFIX_BY_TYPE[input.type] ?? 'GEN';
  const abbr = abbreviate(input.category2 || input.category3);
  const base = `${prefix}-${abbr}-`;
  const rows = await tx.select({ shortCode: products.shortCode }).from(products).where(like(products.shortCode, `${base}%`));
  let max = 0;
  for (const r of rows) {
    const tail = r.shortCode?.slice(base.length) ?? '';
    const n = Number(tail);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${base}${String(max + 1).padStart(2, '0')}`;
}

/**
 * Barkod ile ürün arama: ana barkod, koli barkodu, ek barkodlar (product_barcodes).
 * Excel kaynaklı veride aynı barkodu paylaşan birden çok SKU olabilir (ör. 2x/6x paket varyantları —
 * GS1 kuralına göre her ambalaj boyutuna ayrı EAN gerekirdi ama kaynak veri öyle değil ve normalize
 * edilmez, bkz. `findBarcodeConflicts`). Bu durumda seçim `orderBy(sku)` ile deterministik kılınır —
 * sıralamasız `limit(1)` çağrı çağrıya farklı satır dönebilir, bu da tarama akışında (mal kabul/sayım)
 * yanlış SKU'ya hareket yazılmasına yol açabilirdi.
 */
export async function findByBarcode(
  tx: DbOrTx,
  code: string,
): Promise<{ product: typeof products.$inferSelect; matchKind: 'unit' | 'case' | 'extra' } | null> {
  const c = code.trim();
  if (!c) return null;
  const [byUnit] = await tx.select().from(products).where(eq(products.barcode, c)).orderBy(asc(products.sku)).limit(1);
  if (byUnit) return { product: byUnit, matchKind: 'unit' };
  const [byCase] = await tx.select().from(products).where(eq(products.caseBarcode, c)).orderBy(asc(products.sku)).limit(1);
  if (byCase) return { product: byCase, matchKind: 'case' };
  const [extra] = await tx
    .select({ product: products, kind: productBarcodes.kind })
    .from(productBarcodes)
    .innerJoin(products, eq(products.id, productBarcodes.productId))
    .where(eq(productBarcodes.barcode, c))
    .orderBy(asc(products.sku))
    .limit(1);
  if (extra) return { product: extra.product, matchKind: 'extra' };
  return null;
}

/** Aynı barkodu paylaşan başka SKU var mı (GS1 uyarısı için). */
export async function findBarcodeConflicts(tx: DbOrTx, barcode: string, excludeProductId?: string): Promise<Array<{ sku: string; name: string }>> {
  if (!barcode) return [];
  const rows = await tx.select({ id: products.id, sku: products.sku, name: products.name }).from(products).where(eq(products.barcode, barcode));
  return rows.filter((r) => r.id !== excludeProductId).map((r) => ({ sku: r.sku, name: r.name }));
}

/* ------------------------------------------------------------------ */
/* Kategori ağacı yardımcıları                                         */
/* ------------------------------------------------------------------ */

/** Kategori 1→2→3 yolunu bulur/oluşturur, en alttaki (verilenler kadar derin) kategori id'sini döner. */
export async function ensureCategoryPath(tx: DbOrTx, cat1: string, cat2?: string | null, cat3?: string | null): Promise<string | null> {
  if (!cat1) return null;
  async function ensure(name: string, level: 1 | 2 | 3, parentId: string | null, parentPath: string | null): Promise<string> {
    const path = parentPath ? `${parentPath}/${name}` : name;
    const [existing] = await tx.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.path, path)).limit(1);
    if (existing) return existing.id;
    const [row] = await tx.insert(productCategories).values({ name, level, path, parentId }).returning({ id: productCategories.id });
    return row!.id;
  }
  const l1 = await ensure(cat1, 1, null, null);
  if (!cat2) return l1;
  const l2 = await ensure(cat2, 2, l1, cat1);
  if (!cat3) return l2;
  return ensure(cat3, 3, l2, `${cat1}/${cat2}`);
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export type CreateProductInput = {
  sku: string;
  shortCode?: string | null;
  name: string;
  type: string;
  status?: string;
  category1?: string | null;
  category2?: string | null;
  category3?: string | null;
  variant?: string | null;
  packaging?: string | null;
  packQty?: number;
  uomId: string;
  barcode?: string | null;
  caseBarcode?: string | null;
  isLotTracked?: boolean;
  isPurchasable?: boolean;
  isSellable?: boolean;
  isManufactured?: boolean;
  costMethod?: string;
  shelfLifeDays?: number | null;
  alertDaysBeforeExpiry?: number | null;
  removalDaysBeforeExpiry?: number | null;
  requiresIncomingQc?: boolean;
  quarantineDays?: number;
  vatRate?: string;
  purchaseVatRate?: string;
  listPrice?: string;
  weightKg?: string | null;
  hsCode?: string | null;
  originCountry?: string;
  minQty?: string | null;
  maxQty?: string | null;
  leadTimeDays?: number | null;
  note?: string | null;
};

export async function createProduct(tx: DbOrTx, input: CreateProductInput): Promise<typeof products.$inferSelect> {
  const skuCheck = validateSku(input.sku);
  if (!skuCheck.valid) throw new ValidationError(skuCheck.errors.join('; '));
  if (await isSkuTaken(tx, input.sku)) throw new DomainError('SKU_TAKEN', `SKU zaten kullanımda: ${input.sku}`);
  if (input.barcode && isValidEan13(input.barcode) === false && /^\d+$/.test(input.barcode)) {
    // Sayısal ama checksum tutmuyor — engelleme, yalnızca not düş (bazı eski barkodlar hatalı olabilir)
  }
  const categoryId = await ensureCategoryPath(tx, input.category1 ?? '', input.category2, input.category3);
  const [row] = await tx
    .insert(products)
    .values({
      sku: input.sku,
      shortCode: input.shortCode ?? null,
      name: input.name,
      type: input.type as (typeof products.$inferInsert)['type'],
      status: (input.status ?? 'active') as (typeof products.$inferInsert)['status'],
      categoryId,
      category1: input.category1 || null,
      category2: input.category2 || null,
      category3: input.category3 || null,
      variant: input.variant ?? null,
      packaging: input.packaging ?? null,
      packQty: input.packQty ?? 1,
      uomId: input.uomId,
      barcode: input.barcode ?? null,
      caseBarcode: input.caseBarcode ?? null,
      isLotTracked: input.isLotTracked ?? true,
      isPurchasable: input.isPurchasable ?? false,
      isSellable: input.isSellable ?? false,
      isManufactured: input.isManufactured ?? false,
      costMethod: (input.costMethod ?? 'lot') as (typeof products.$inferInsert)['costMethod'],
      shelfLifeDays: input.shelfLifeDays ?? null,
      alertDaysBeforeExpiry: input.alertDaysBeforeExpiry ?? null,
      removalDaysBeforeExpiry: input.removalDaysBeforeExpiry ?? null,
      requiresIncomingQc: input.requiresIncomingQc ?? false,
      quarantineDays: input.quarantineDays ?? 0,
      vatRate: input.vatRate ?? '1',
      purchaseVatRate: input.purchaseVatRate ?? '20',
      listPrice: input.listPrice ?? '0',
      weightKg: input.weightKg ?? null,
      hsCode: input.hsCode ?? null,
      originCountry: input.originCountry ?? 'TR',
      minQty: input.minQty ?? null,
      maxQty: input.maxQty ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      note: input.note ?? null,
    })
    .returning();
  return row!;
}

export type UpdateProductInput = Partial<Omit<CreateProductInput, 'sku'>> & { name?: string; barcode?: string | null };

export async function updateProduct(
  tx: DbOrTx,
  id: string,
  input: UpdateProductInput,
  opts: { allowIdentityChange?: boolean; reason?: string } = {},
): Promise<typeof products.$inferSelect> {
  const [existing] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Ürün', id);

  const nameChanged = input.name !== undefined && input.name !== existing.name;
  const barcodeChanged = input.barcode !== undefined && (input.barcode ?? null) !== (existing.barcode ?? null);
  if (nameChanged || barcodeChanged) {
    if (!opts.allowIdentityChange) {
      throw new DomainError('IDENTITY_LOCKED', 'Ürün adı ve barkod oluşturulduktan sonra kilitlenir; değiştirmek için admin.settings izni gerekir.');
    }
    if (!opts.reason?.trim()) {
      throw new ValidationError('Ad/barkod değişikliği için bir gerekçe girilmelidir.');
    }
  }

  const categoryId =
    input.category1 !== undefined ? await ensureCategoryPath(tx, input.category1 ?? '', input.category2 ?? existing.category2, input.category3 ?? existing.category3) : undefined;

  const set: Partial<typeof products.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.barcode !== undefined) set.barcode = input.barcode;
  if (input.shortCode !== undefined) set.shortCode = input.shortCode;
  if (input.type !== undefined) set.type = input.type as (typeof products.$inferInsert)['type'];
  if (input.status !== undefined) set.status = input.status as (typeof products.$inferInsert)['status'];
  if (categoryId !== undefined) set.categoryId = categoryId;
  if (input.category1 !== undefined) set.category1 = input.category1 || null;
  if (input.category2 !== undefined) set.category2 = input.category2 || null;
  if (input.category3 !== undefined) set.category3 = input.category3 || null;
  if (input.variant !== undefined) set.variant = input.variant;
  if (input.packaging !== undefined) set.packaging = input.packaging;
  if (input.packQty !== undefined) set.packQty = input.packQty;
  if (input.uomId !== undefined) set.uomId = input.uomId;
  if (input.caseBarcode !== undefined) set.caseBarcode = input.caseBarcode;
  if (input.isLotTracked !== undefined) set.isLotTracked = input.isLotTracked;
  if (input.isPurchasable !== undefined) set.isPurchasable = input.isPurchasable;
  if (input.isSellable !== undefined) set.isSellable = input.isSellable;
  if (input.isManufactured !== undefined) set.isManufactured = input.isManufactured;
  if (input.costMethod !== undefined) set.costMethod = input.costMethod as (typeof products.$inferInsert)['costMethod'];
  if (input.shelfLifeDays !== undefined) set.shelfLifeDays = input.shelfLifeDays;
  if (input.alertDaysBeforeExpiry !== undefined) set.alertDaysBeforeExpiry = input.alertDaysBeforeExpiry;
  if (input.removalDaysBeforeExpiry !== undefined) set.removalDaysBeforeExpiry = input.removalDaysBeforeExpiry;
  if (input.requiresIncomingQc !== undefined) set.requiresIncomingQc = input.requiresIncomingQc;
  if (input.quarantineDays !== undefined) set.quarantineDays = input.quarantineDays;
  if (input.vatRate !== undefined) set.vatRate = input.vatRate;
  if (input.purchaseVatRate !== undefined) set.purchaseVatRate = input.purchaseVatRate;
  if (input.listPrice !== undefined) set.listPrice = input.listPrice;
  if (input.weightKg !== undefined) set.weightKg = input.weightKg;
  if (input.hsCode !== undefined) set.hsCode = input.hsCode;
  if (input.originCountry !== undefined) set.originCountry = input.originCountry;
  if (input.minQty !== undefined) set.minQty = input.minQty;
  if (input.maxQty !== undefined) set.maxQty = input.maxQty;
  if (input.leadTimeDays !== undefined) set.leadTimeDays = input.leadTimeDays;
  if (input.note !== undefined) set.note = input.note;

  const [row] = await tx.update(products).set(set).where(eq(products.id, id)).returning();
  return row!;
}

/** Ek barkod ekler (kolli/palet vb.); aynı (productId, barcode, kind) varsa dokunmaz. */
export async function addProductBarcode(
  tx: DbOrTx,
  input: { productId: string; barcode: string; kind?: string; note?: string | null },
): Promise<typeof productBarcodes.$inferSelect> {
  const [row] = await tx
    .insert(productBarcodes)
    .values({ productId: input.productId, barcode: input.barcode, kind: input.kind ?? 'extra', note: input.note ?? null })
    .onConflictDoNothing({ target: [productBarcodes.productId, productBarcodes.barcode, productBarcodes.kind] })
    .returning();
  if (row) return row;
  const [existing] = await tx
    .select()
    .from(productBarcodes)
    .where(and(eq(productBarcodes.productId, input.productId), eq(productBarcodes.barcode, input.barcode), eq(productBarcodes.kind, input.kind ?? 'extra')))
    .limit(1);
  return existing!;
}

export async function removeProductBarcode(tx: DbOrTx, id: string): Promise<void> {
  await tx.delete(productBarcodes).where(eq(productBarcodes.id, id));
}

/** sku_segments sözlüğüne yeni bir kod ekler (Kod Yapısı sayfası — "rezerve" işaretlenebilir). */
export async function addSkuSegment(
  tx: DbOrTx,
  input: { segment: string; context?: string | null; code: string; label: string; isReserved?: boolean; sortOrder?: number },
): Promise<typeof skuSegments.$inferSelect> {
  const [row] = await tx
    .insert(skuSegments)
    .values({ segment: input.segment, context: input.context ?? null, code: input.code, label: input.label, isReserved: input.isReserved ?? false, sortOrder: input.sortOrder ?? 0 })
    .onConflictDoUpdate({
      target: [skuSegments.segment, skuSegments.context, skuSegments.code],
      set: { label: input.label, isReserved: input.isReserved ?? false },
    })
    .returning();
  return row!;
}

import ExcelJS from 'exceljs';
import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { products, productBarcodes, productCategories, skuSegments, uoms, type productTypeEnum } from '../schema/index.js';

/**
 * Plantero Ana Veri (Konuşan Kod) Excel içe aktarımı.
 * Kaynak: data/import/Plantero_AnaVeri_KonusanKod.xlsx — 'Ana Veri' + 'Kod Yapısı' sayfaları.
 *
 * Konuşan kod: SKU 9 hane T·AA·BB·CC·PP
 *   T (1. hane)  : 1 mamul, 2 yarı mamul (rezerve), 3 hammadde, 4 ambalaj (rezerve), 8 teknik ekipman, 9 demirbaş
 *   AA (2-3)     : ürün ailesi / hammadde grubu
 *   BB (4-5)     : bileşen / alt kategori
 *   CC (6-7)     : varyant
 *   PP (8-9)     : ambalaj / adet
 *
 * KURAL: Ürün adı ve barkod Excel'den geldiği gibi kalır — bu dosya ASLA normalize etmez,
 * import sırasında da mevcut kayıtların adı/barkodu üzerine asla yazılmaz (bkz. importAnaVeri).
 */

export type ProductType = (typeof productTypeEnum.enumValues)[number];

const SKU_TYPE_BY_DIGIT: Record<string, ProductType> = {
  '1': 'finished',
  '2': 'semi_finished',
  '3': 'raw_material',
  '4': 'packaging',
  '8': 'equipment',
  '9': 'fixed_asset',
};

/** SKU 1. hanesinden kayıt tipini çözer; bilinmeyen hane 'service' olarak işaretlenir (uyarı ile). */
export function productTypeFromSku(sku: string): { type: ProductType; unknown: boolean } {
  const digit = sku.trim().charAt(0);
  const type = SKU_TYPE_BY_DIGIT[digit];
  return type ? { type, unknown: false } : { type: 'service', unknown: true };
}

/** Excel "Durum" kolonu → ürün statüsü. Yalnızca tam eşleşen "İptal" arşivlenir; diğer her şey (boş dahil) aktif kabul edilir. */
export function statusFromDurum(durum: string | null): 'active' | 'cancelled' {
  return (durum ?? '').trim().toLocaleUpperCase('tr-TR') === 'İPTAL'.toLocaleUpperCase('tr-TR') ? 'cancelled' : 'active';
}

/**
 * "Ambalaj / Adet" metninden ambalaj içi adet (packQty) çözümü.
 * Tekli→1, 2'li→2, 3'lü→3, 6'lı→6, "12 Adet"→12, "N Adet"→N, "Palet"→1 (ambalaj etiketi "Palet" olarak kalır),
 * "10gr x 10 saşe" gibi "x N saşe/stick" kalıpları→N, "Set"→1, tanımsız/null→1.
 */
export function parsePackQty(ambalaj: string | null): number {
  if (!ambalaj) return 1;
  const s = ambalaj.trim();
  if (/^palet$/i.test(s)) return 1;
  if (/^set$/i.test(s)) return 1;
  if (/^tekli$/i.test(s)) return 1;
  const xSase = s.match(/x\s*(\d+)\s*(sa[şs]e|stick)/i);
  if (xSase?.[1]) return parseInt(xSase[1], 10);
  const nli = s.match(/^(\d+)/);
  if (nli?.[1]) return parseInt(nli[1], 10);
  return 1;
}

/** Excel hücresinden barkod: sayısal geldiyse string'e çevrilir ve 13 haneye tamamlanır (EAN-13 başındaki sıfır kaybı telafisi). */
export function barcodeFromCell(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return String(Math.round(v)).padStart(13, '0');
  const s = String(v).trim();
  return s === '' ? null : s;
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v !== null && 'result' in (v as Record<string, unknown>)) {
    return cellText((v as { result: unknown }).result);
  }
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  return s === '' ? null : s;
}

function cellNumber(v: unknown): number | null {
  const t = cellText(v);
  if (t === null) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export type UomCode = 'ADET' | 'KG';

/** Tip → varsayılan ölçü birimi: mamul/ekipman/demirbaş/ambalaj ADET; hammadde/yarı mamul KG. */
export function defaultUomForType(type: ProductType): UomCode {
  return type === 'raw_material' || type === 'semi_finished' ? 'KG' : 'ADET';
}

export type ParsedProduct = {
  rowNo: number;
  sku: string;
  shortCode: string | null;
  name: string;
  category1: string;
  category2: string;
  category3: string;
  variant: string | null;
  packagingLabel: string | null;
  packQty: number;
  barcode: string | null;
  caseBarcode: string | null;
  status: 'active' | 'cancelled';
  legacyLocationCode: string | null;
  excelQty: number | null;
  oldSku: string | null;
  note: string | null;
  type: ProductType;
  uomCode: UomCode;
  isLotTracked: boolean;
  isPurchasable: boolean;
  isSellable: boolean;
  isManufactured: boolean;
  vatRate: string;
  purchaseVatRate: string;
  shelfLifeDays: number | null;
};

export type ParsedSegment = {
  segment: string; // T, AA, BB, CC, PP
  context: string | null;
  code: string;
  label: string;
};

const isPromoSku = (sku: string) => sku.startsWith('170');

/** Tek bir Ana Veri satırından ParsedProduct türetir (saf; DB erişimi yok). */
function buildParsedProduct(rowNo: number, raw: Record<string, unknown>, warnings: string[]): ParsedProduct | null {
  const sku = cellText(raw.sku);
  const name = cellText(raw.name);
  if (!sku || !name) {
    warnings.push(`Satır ${rowNo}: SKU veya Ürün Adı boş — atlandı`);
    return null;
  }
  const { type, unknown } = productTypeFromSku(sku);
  if (unknown) warnings.push(`Satır ${rowNo} (${sku}): SKU ilk hanesi tanınmayan tip kodu — 'service' olarak işaretlendi`);

  const durum = cellText(raw.durum);
  const status = statusFromDurum(durum);
  const packagingLabel = cellText(raw.packaging);
  const packQty = parsePackQty(packagingLabel);
  const isCancelled = status === 'cancelled';
  const isPromo = isPromoSku(sku);
  const isFinished = type === 'finished';

  const isManufactured = isFinished && !isCancelled && !isPromo;
  const isSellable = isFinished && !isCancelled && !isPromo;
  const isPurchasable = !isFinished || (isPromo && !isCancelled);
  const isLotTracked = type === 'finished' || type === 'semi_finished' || type === 'raw_material' || type === 'packaging';

  const vatRate = isPromo || type === 'raw_material' || type === 'packaging' || type === 'equipment' || type === 'fixed_asset' || type === 'semi_finished' ? '20' : '1';
  const purchaseVatRate = '20';

  const shelfLifeDays = isFinished && !isCancelled && !isPromo ? 365 : type === 'raw_material' ? 540 : type === 'packaging' ? 1825 : null;

  return {
    rowNo,
    sku,
    shortCode: cellText(raw.shortCode),
    name,
    category1: cellText(raw.category1) ?? '',
    category2: cellText(raw.category2) ?? '',
    category3: cellText(raw.category3) ?? '',
    variant: cellText(raw.variant),
    packagingLabel,
    packQty,
    barcode: barcodeFromCell(raw.barcode),
    caseBarcode: barcodeFromCell(raw.caseBarcode),
    status,
    legacyLocationCode: cellText(raw.location),
    excelQty: cellNumber(raw.qty),
    oldSku: cellText(raw.oldSku),
    note: cellText(raw.note),
    type,
    uomCode: defaultUomForType(type),
    isLotTracked,
    isPurchasable,
    isSellable,
    isManufactured,
    vatRate,
    purchaseVatRate,
    shelfLifeDays,
  };
}

/** "Kod Yapısı" sayfasını segment sözlüğüne çevirir — belgesel/serbest biçimli bir sayfa olduğu için bölüm başlıklarına göre pragmatik ayrıştırma yapar. */
function parseKodYapisiSheet(ws: ExcelJS.Worksheet, warnings: string[]): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  type Section = { segment: string; context: string | null } | null;
  let section: Section = null;

  const sectionFor = (title: string): Section => {
    const t = title.toLocaleUpperCase('tr-TR');
    if (t.startsWith('T —') || t.startsWith('T -')) return { segment: 'T', context: null };
    if (t.startsWith('AA — ÜRÜN AİLESİ') || t.startsWith('AA - ÜRÜN AİLESİ')) return { segment: 'AA', context: 'finished' };
    if (t.startsWith('BB —') || t.startsWith('BB -')) return { segment: 'BB', context: null };
    if (t.startsWith('CC —') || t.startsWith('CC -')) return { segment: 'CC', context: null };
    if (t.startsWith('PP —') || t.startsWith('PP -')) return { segment: 'PP', context: null };
    if (t.includes('HAMMADDE GRUPLARI')) return { segment: 'AA', context: 'raw_material' };
    if (t.includes('TEKNİK EKİPMAN GRUPLARI')) return { segment: 'AA', context: 'equipment' };
    return null;
  };

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const c1 = cellText(row.getCell(1).value);
    const c2 = cellText(row.getCell(2).value);
    const c3 = cellText(row.getCell(3).value);
    if (!c1 && !c2 && !c3) {
      section = null;
      continue;
    }
    if (c1 && !c2 && !c3) {
      const maybeSection = sectionFor(c1);
      if (maybeSection) {
        section = maybeSection;
        continue;
      }
    }
    if (c1 === 'Kod' || c1 === 'Segment') continue; // alt başlık satırı
    if (!section) continue;
    if (!c1 || !c2) continue;
    out.push({ segment: section.segment, context: section.context, code: c1, label: c2 });
  }
  if (out.length === 0) warnings.push('Kod Yapısı sayfasından hiç segment ayrıştırılamadı');
  return out;
}

/**
 * Ana Veri Excel dosyasını ayrıştırır. Saf fonksiyon — veritabanına erişmez, import sihirbazı da kullanabilir.
 */
export async function parseAnaVeri(buffer: Buffer | ArrayBuffer): Promise<{ products: ParsedProduct[]; segments: ParsedSegment[]; warnings: string[] }> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const anaVeriSheet = wb.getWorksheet('Ana Veri');
  if (!anaVeriSheet) throw new Error("'Ana Veri' sayfası bulunamadı");

  const headerRow = anaVeriSheet.getRow(1);
  const headerIndex = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const h = cellText(cell.value);
    if (h) headerIndex.set(h.trim(), colNumber);
  });
  const col = (name: string): number | undefined => headerIndex.get(name);
  const idx = {
    sku: col('SKU'),
    shortCode: col('Kısa Kod'),
    name: col('Ürün Adı'),
    category1: col('Kategori 1'),
    category2: col('Kategori 2'),
    category3: col('Kategori 3'),
    variant: col('Varyant'),
    packaging: col('Ambalaj / Adet'),
    barcode: col('Barkod (EAN-13)'),
    caseBarcode: col('Koli Barkodu'),
    durum: col('Durum'),
    location: col('Lokasyon'),
    qty: col('Miktar'),
    oldSku: col('Eski SKU'),
    note: col('Not'),
  } as const;

  const parsedProducts: ParsedProduct[] = [];
  for (let r = 2; r <= anaVeriSheet.rowCount; r++) {
    const row = anaVeriSheet.getRow(r);
    const get = (i: number | undefined) => (i ? row.getCell(i).value : null);
    const raw: Record<string, unknown> = {
      sku: get(idx.sku),
      shortCode: get(idx.shortCode),
      name: get(idx.name),
      category1: get(idx.category1),
      category2: get(idx.category2),
      category3: get(idx.category3),
      variant: get(idx.variant),
      packaging: get(idx.packaging),
      barcode: get(idx.barcode),
      caseBarcode: get(idx.caseBarcode),
      durum: get(idx.durum),
      location: get(idx.location),
      qty: get(idx.qty),
      oldSku: get(idx.oldSku),
      note: get(idx.note),
    };
    if (raw.sku === null && raw.name === null) continue; // tamamen boş satır
    const parsed = buildParsedProduct(r, raw, warnings);
    if (parsed) parsedProducts.push(parsed);
  }

  const kodSheet = wb.getWorksheet('Kod Yapısı');
  const segments = kodSheet ? parseKodYapisiSheet(kodSheet, warnings) : [];
  if (!kodSheet) warnings.push("'Kod Yapısı' sayfası bulunamadı — segment sözlüğü boş");

  // Barkod çakışması uyarıları (birden çok SKU aynı barkodu paylaşıyor)
  const byBarcode = new Map<string, string[]>();
  for (const p of parsedProducts) {
    if (!p.barcode) continue;
    const list = byBarcode.get(p.barcode) ?? [];
    list.push(p.sku);
    byBarcode.set(p.barcode, list);
  }
  for (const [barcode, skus] of byBarcode) {
    if (skus.length > 1) warnings.push(`Barkod ${barcode} birden çok SKU'da kullanılıyor: ${skus.join(', ')} (GS1: her ambalaj boyutuna ayrı EAN önerilir)`);
  }

  return { products: parsedProducts, segments, warnings };
}

export type ImportAnaVeriResult = {
  created: number;
  updated: number;
  unchanged: number;
  conflicts: Array<{ sku: string; field: 'name' | 'barcode'; existing: string | null; incoming: string | null }>;
};

/**
 * Ayrıştırılmış Ana Veri'yi veritabanına işler.
 * KURAL: mevcut ürünün `name` ve `barcode` kolonları hiçbir koşulda güncellenmez — farklıysa `conflicts`'e yazılır.
 */
export async function importAnaVeri(
  db: DbOrTx,
  parsed: { products: ParsedProduct[]; segments: ParsedSegment[] },
  opts: { dryRun?: boolean } = {},
): Promise<ImportAnaVeriResult> {
  const dryRun = opts.dryRun ?? false;
  const result: ImportAnaVeriResult = { created: 0, updated: 0, unchanged: 0, conflicts: [] };

  const uomRows = await db.select().from(uoms).where(inArray(uoms.code, ['ADET', 'KG']));
  const uomIdByCode = new Map(uomRows.map((u) => [u.code, u.id]));

  // sku_segments
  for (const seg of parsed.segments) {
    if (dryRun) continue;
    await db
      .insert(skuSegments)
      .values({ segment: seg.segment, context: seg.context, code: seg.code, label: seg.label })
      .onConflictDoUpdate({
        target: [skuSegments.segment, skuSegments.context, skuSegments.code],
        set: { label: seg.label },
      });
  }

  // Kategori ağacı önbelleği: path → id
  const categoryIdByPath = new Map<string, string>();
  async function ensureCategory(name: string, level: 1 | 2 | 3, parentPath: string | null): Promise<string> {
    const path = parentPath ? `${parentPath}/${name}` : name;
    const cached = categoryIdByPath.get(path);
    if (cached) return cached;
    const parentId = parentPath ? (categoryIdByPath.get(parentPath) ?? null) : null;
    if (dryRun) {
      categoryIdByPath.set(path, path);
      return path;
    }
    await db
      .insert(productCategories)
      .values({ name, level, path, parentId })
      .onConflictDoNothing({ target: productCategories.path });
    const [row] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.path, path)).limit(1);
    if (!row) throw new Error(`Kategori oluşturulamadı: ${path}`);
    categoryIdByPath.set(path, row.id);
    return row.id;
  }

  for (const p of parsed.products) {
    const uomId = dryRun ? null : (uomIdByCode.get(p.uomCode) ?? null);
    if (!dryRun && !uomId) throw new Error(`Ölçü birimi bulunamadı: ${p.uomCode} (seed/uoms.ts önce çalışmalı)`);

    let categoryId: string | null = null;
    if (p.category1) {
      const l1 = await ensureCategory(p.category1, 1, null);
      let path = p.category1;
      let l2id = l1;
      if (p.category2) {
        l2id = await ensureCategory(p.category2, 2, path);
        path = `${path}/${p.category2}`;
      }
      let l3id = l2id;
      if (p.category3) {
        l3id = await ensureCategory(p.category3, 3, path);
      }
      categoryId = l3id;
    }

    const [existing] = dryRun ? [] : await db.select().from(products).where(eq(products.sku, p.sku)).limit(1);

    if (existing) {
      if (existing.name !== p.name) result.conflicts.push({ sku: p.sku, field: 'name', existing: existing.name, incoming: p.name });
      if ((existing.barcode ?? null) !== p.barcode) result.conflicts.push({ sku: p.sku, field: 'barcode', existing: existing.barcode, incoming: p.barcode });

      const nextValues = {
        shortCode: p.shortCode,
        type: p.type,
        status: p.status,
        categoryId,
        category1: p.category1 || null,
        category2: p.category2 || null,
        category3: p.category3 || null,
        variant: p.variant,
        packaging: p.packagingLabel,
        packQty: p.packQty,
        caseBarcode: p.caseBarcode,
        oldSku: p.oldSku,
        legacyLocationCode: p.legacyLocationCode,
        isLotTracked: p.isLotTracked,
        isPurchasable: p.isPurchasable,
        isSellable: p.isSellable,
        isManufactured: p.isManufactured,
        shelfLifeDays: p.shelfLifeDays,
        vatRate: p.vatRate,
        purchaseVatRate: p.purchaseVatRate,
        note: p.note,
        meta: p.excelQty !== null ? { excelQty: p.excelQty } : {},
      };
      const changed =
        existing.shortCode !== nextValues.shortCode ||
        existing.type !== nextValues.type ||
        existing.status !== nextValues.status ||
        existing.category1 !== nextValues.category1 ||
        existing.category2 !== nextValues.category2 ||
        existing.category3 !== nextValues.category3 ||
        existing.packQty !== nextValues.packQty ||
        (existing.caseBarcode ?? null) !== nextValues.caseBarcode;

      if (!dryRun && changed) {
        await db.update(products).set(nextValues).where(eq(products.id, existing.id));
        result.updated++;
      } else {
        result.unchanged++;
      }
    } else {
      if (!dryRun) {
        await db.insert(products).values({
          sku: p.sku,
          shortCode: p.shortCode,
          name: p.name,
          type: p.type,
          status: p.status,
          categoryId,
          category1: p.category1 || null,
          category2: p.category2 || null,
          category3: p.category3 || null,
          variant: p.variant,
          packaging: p.packagingLabel,
          packQty: p.packQty,
          uomId: uomId as string,
          barcode: p.barcode,
          caseBarcode: p.caseBarcode,
          oldSku: p.oldSku,
          legacyLocationCode: p.legacyLocationCode,
          isLotTracked: p.isLotTracked,
          isPurchasable: p.isPurchasable,
          isSellable: p.isSellable,
          isManufactured: p.isManufactured,
          shelfLifeDays: p.shelfLifeDays,
          vatRate: p.vatRate,
          purchaseVatRate: p.purchaseVatRate,
          note: p.note,
          meta: p.excelQty !== null ? { excelQty: p.excelQty } : {},
        });
      }
      result.created++;
    }
  }

  // Aynı barkodun birden çok SKU'da kullanımı → product_barcodes'a not ile ekle
  if (!dryRun) {
    const byBarcode = new Map<string, ParsedProduct[]>();
    for (const p of parsed.products) {
      if (!p.barcode) continue;
      const list = byBarcode.get(p.barcode) ?? [];
      list.push(p);
      byBarcode.set(p.barcode, list);
    }
    for (const [barcode, group] of byBarcode) {
      if (group.length < 2) continue;
      const skus = group.map((g) => g.sku);
      for (const p of group) {
        const [prod] = await db.select({ id: products.id }).from(products).where(eq(products.sku, p.sku)).limit(1);
        if (!prod) continue;
        await db
          .insert(productBarcodes)
          .values({
            productId: prod.id,
            barcode,
            kind: 'unit',
            note: `Bu barkod ${skus.length} SKU'da ortak: ${skus.filter((s) => s !== p.sku).join(', ')}`,
          })
          .onConflictDoNothing({ target: [productBarcodes.productId, productBarcodes.barcode, productBarcodes.kind] });
      }
    }
  }

  return result;
}

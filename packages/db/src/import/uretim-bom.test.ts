import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseUretimBom, parseTrNumber, foldKey, findBlock, ingredientLinesOf, type ParsedUretimBom, type BomBlock } from './uretim-bom.js';
import { buildBomPlan, planSkus, type CatalogProduct } from './uretim-bom-plan.js';
import { CONCENTRATE_RENAMES } from './konsantre-adlari.js';
import { parseAnaVeri } from './anaveri.js';

const dataDir = path.resolve(import.meta.dirname, '../../../../data/import');

let parsed: ParsedUretimBom;
let catalog: CatalogProduct[];

beforeAll(async () => {
  parsed = await parseUretimBom(await readFile(path.join(dataDir, 'Plantero_Uretim_Ana_Excel.xlsx')));
  const ana = await parseAnaVeri(await readFile(path.join(dataDir, 'Plantero_AnaVeri_KonusanKod.xlsx')));
  // Ana Veri Excel'inde olmayan, masterdata seed'inin açtığı hammadde/ambalaj SKU'ları (reçete eşlemesi bunlara da bağlanır)
  const seeded: Array<[string, string, string]> = [
    ['301030000', 'Badem', 'raw_material'], ['301040000', 'Fındık', 'raw_material'], ['301050000', 'Kaju', 'raw_material'], ['301060000', 'Yulaf', 'raw_material'],
    ['302030000', 'Hurma Şurubu', 'raw_material'], ['307020000', 'Deniz Tuzu', 'raw_material'], ['308010000', 'Kahve Çekirdeği (Yeşil)', 'raw_material'],
    ['308020000', 'Matcha Tozu (Toptan)', 'raw_material'], ['308030000', 'Vanilya Tozu (Toptan)', 'raw_material'], ['308040000', 'Hurma (Kuru, Çekirdeksiz)', 'raw_material'],
    ['401010000', 'Kavanoz 500ml', 'packaging'], ['401020000', 'Kapak', 'packaging'], ['401030000', 'Etiket', 'packaging'], ['401040000', "Koli 6'lı", 'packaging'],
    ['402010000', 'Doypack 1kg', 'packaging'], ['402020000', 'Saşe 10g', 'packaging'], ['402030000', 'Kraft Kahve Torbası 250g', 'packaging'],
  ];
  const have = new Set(ana.products.map((p) => p.sku));
  catalog = [
    ...ana.products.map((p) => ({ sku: p.sku, name: p.name, type: p.type, packQty: p.packQty, isManufactured: p.isManufactured, standardCost: '0' })),
    ...seeded.filter(([sku]) => !have.has(sku)).map(([sku, name, type]) => ({ sku, name, type, packQty: 1, isManufactured: false, standardCost: '0' })),
  ];
});

const names = (b: BomBlock): string[] => b.lines.map((l) => l.name);

describe('parseTrNumber / foldKey', () => {
  it('TR para metinlerini sayıya çevirir', () => {
    expect(parseTrNumber('110,00 ₺')).toBe(110);
    expect(parseTrNumber('2.000,00 ₺')).toBe(2000);
    expect(parseTrNumber('0,5')).toBe(0.5);
    expect(parseTrNumber(12.5)).toBe(12.5);
    expect(parseTrNumber(null)).toBeNull();
    expect(parseTrNumber('abc')).toBeNull();
  });
  it('foldKey yalnızca karşılaştırma anahtarıdır (Türkçe harfler sadeleşir)', () => {
    expect(foldKey('Ayçiçek Yağı')).toBe('aycicek yagi');
    expect(foldKey('ÇİLEK Aroma')).toBe('cilek aroma');
  });
});

describe('parseUretimBom — gerçek dosya', () => {
  it('YALNIZCA görünür sayfalar okunur: gizli sayfalar listelenir ama blok üretmez; RM Listesi okunur', () => {
    const sheetNames = parsed.sheets.map((s) => s.name.trim());
    expect(sheetNames).toContain('ALMOND 250GR');
    expect(sheetNames).toContain('OAT 500GR');
    expect(parsed.sheets.find((s) => s.name.trim() === 'OAT 500GR')?.hidden).toBe(true);
    expect(parsed.skippedHidden.map((n) => n.trim())).toEqual(
      expect.arrayContaining(['OAT 500GR', 'Bitkisel Baz Barista Ana Sheet', 'Barista 500GR Complex Nuts', 'Plantero Çilek Protein Mix', 'Plantero Çikolata Protein Mix', 'Plantero 250GR Bases']),
    );
    // hiçbir blok gizli sayfadan gelmez
    const hiddenNames = new Set(parsed.sheets.filter((s) => s.hidden).map((s) => s.name));
    expect(parsed.blocks.filter((b) => hiddenNames.has(b.sheet))).toEqual([]);
    expect(parsed.blocks.every((b) => !b.hidden)).toBe(true);
    // görünür sayfa seti (kullanıcı listesi)
    const visible = parsed.sheets.filter((s) => !s.hidden).map((s) => s.name.trim());
    expect(visible).toEqual([
      'COGs summary', 'RM List', 'PRODUCTION worksheet', 'Plantero Protein Mix Reçeteleri', 'KAJUBEAR 300GR', 'MATCHA POWDER', 'OATPOWDER 20GR', 'ALMOND 250GR',
      'Barista 300GR Complex Citru (2)', '250 gram bitkisel skonsantreler',
    ]);
    expect(findBlock(parsed, 'OAT 500GR')).toBeUndefined();
    expect(parsed.rmList.length).toBeGreaterThanOrEqual(15);
    const badem = parsed.rmList.find((r) => r.description === 'BADEM PUREE');
    expect(badem?.tlPerKg).toBe(361);
    expect(badem?.supplier).toBe('AYDIN');
  });

  it('ALMOND 250GR: 250 g parti, 3 hammadde (%33) + ambalaj satırları', () => {
    const b = findBlock(parsed, 'ALMOND 250GR')!;
    expect(b).toBeDefined();
    expect(b.batch).toBe(250);
    expect(b.ratioScale).toBe('fraction');
    const ing = ingredientLinesOf(b);
    expect(ing.map((l) => l.name.toLowerCase())).toEqual(['almond', 'ayçiçek yağı', 'kaju']);
    expect(ing[0]!.ratio).toBeCloseTo(0.33, 5);
    expect(ing[0]!.qty).toBeCloseTo(82.5, 5);
    expect(ing[0]!.supplier).toBe('Aydin');
    expect(ing[0]!.priceTL).toBe(361);
    // ambalaj: miktarsız "1 adet" satırları
    const pack = b.lines.filter((l) => l.qty === null);
    expect(pack.map((l) => l.name)).toEqual(expect.arrayContaining(['HALE CAM ŞİŞE 250CC', 'METAL KAPAK 38 ÇAP TWİST OFF', 'BAZ ETİKETLERİ']));
    expect(pack.find((l) => l.name === 'HALE CAM ŞİŞE 250CC')?.priceTL).toBe(5.04);
  });

  it('KAJUBEAR 300GR: iki blok, parti 100.000, oranlar toplamı ilk blokta %142', () => {
    const blocks = parsed.blocks.filter((b) => b.sheet.trim() === 'KAJUBEAR 300GR');
    expect(blocks).toHaveLength(2);
    const b = blocks[0]!;
    expect(b.batch).toBe(100000);
    expect(names(b)).toEqual(expect.arrayContaining(['KAJU EZMESİ', 'AYÇİÇEK YAĞ', 'KAKAO', 'COCONUT', 'ŞEKER']));
    const kaju = b.lines.find((l) => l.name === 'KAJU EZMESİ')!;
    expect(kaju.ratio).toBeCloseTo(0.2, 5);
    expect(kaju.qty).toBe(20000);
    expect(kaju.priceTL).toBe(360);
    expect(b.ratioSum).toBeCloseTo(1.42, 2);
    expect(blocks[1]!.ratioSum).toBeCloseTo(1.0, 2);
  });

  it('OATPOWDER 20GR: 20 g parti; "packaging" etiketli CATANOIA COCO aslında karışım bileşeni', () => {
    const b = findBlock(parsed, 'OATPOWDER 20GR')!;
    expect(b.batch).toBe(20);
    const ing = ingredientLinesOf(b);
    expect(ing.map((l) => l.name)).toEqual(['OATPOWDER', 'CATANOIA COCO', 'INULİN', 'Calcium Karbonate']);
    expect(ing.reduce((a, l) => a + l.ratio!, 0)).toBeCloseTo(1.0, 5);
    expect(ing[0]!.qty).toBeCloseTo(9, 5);
    expect(ing[0]!.priceTL).toBe(546);
    const evepack = b.lines.find((l) => l.name === 'evepack')!;
    expect(evepack.qty).toBeNull();
    expect(evepack.ratio).toBe(1);
    expect(evepack.priceTL).toBe(1.5);
  });

  it('çok bloklu sayfa: Protein Mix Reçeteleri başlık satırlarıyla ayrışır', () => {
    const sheet = parsed.blocks.filter((b) => b.sheet.trim() === 'Plantero Protein Mix Reçeteleri');
    const rows = sheet.map((b) => b.headerRow);
    expect(rows).toEqual(expect.arrayContaining([2, 24, 47, 94]));
    const kakao = sheet.find((b) => b.headerRow === 24)!;
    expect(kakao.title).toBe('KAKAO');
    expect(kakao.ratioSum).toBeCloseTo(1.0, 2);
    const pea = kakao.lines.find((l) => l.name === 'Isolated Pea Protein')!;
    expect(pea.priceTL).toBe(110); // "110,00 ₺" metni sayıya çevrildi
  });

  it('PRODUCTION worksheet 900. satır STRAWBERRY, Protein Mix Reçeteleri 47. satır ile aynı karışım (SKU 130010201 kaynağı)', () => {
    const a = parsed.blocks.find((b) => b.sheet.trim() === 'PRODUCTION worksheet' && b.headerRow === 900)!;
    const b = parsed.blocks.find((x) => x.sheet.trim() === 'Plantero Protein Mix Reçeteleri' && x.headerRow === 47)!;
    expect(a.title).toBe('STRAWBERRY');
    const ra = ingredientLinesOf(a).map((l) => [l.name, l.ratio!.toFixed(4)]);
    const rb = ingredientLinesOf(b).map((l) => [l.name, l.ratio!.toFixed(4)]);
    expect(ra).toEqual(rb);
  });

  it('formül hataları (#N/A, #VALUE!) satır üretmez', () => {
    const b = findBlock(parsed, 'Barista 300GR Complex Citru (2)', 'Cashew Barista')!;
    expect(b.lines.some((l) => /water/i.test(l.name) && l.qty !== null)).toBe(false);
  });
});

describe('konsantre mamul adları (A16) — ürün hiyerarşisi', () => {
  it('her yeniden adlandırmanın "from" adı Excel ana verisiyle BİREBİR aynıdır, SKU tektir, hedef ad "Sütü Konsantresi" kalıbıdır', () => {
    const byName = new Map(catalog.map((c) => [c.sku, c.name]));
    expect(new Set(CONCENTRATE_RENAMES.map((r) => r.sku)).size).toBe(CONCENTRATE_RENAMES.length);
    for (const r of CONCENTRATE_RENAMES) {
      expect(byName.get(r.sku), r.sku).toBe(r.from);
      expect(r.to).toMatch(/Sütü Konsantresi/);
      expect(r.to).not.toMatch(/Baz/i);
      expect(r.sku).toMatch(/^1100[1-4]/);
    }
    expect(CONCENTRATE_RENAMES.find((r) => r.sku === '110010001')!.to).toBe('Badem Sütü Konsantresi');
    expect(CONCENTRATE_RENAMES.find((r) => r.sku === '110030101')!.to).toBe('Kaju Sütü Konsantresi (ABD alternatif)');
    expect(CONCENTRATE_RENAMES).toHaveLength(14);
  });

  it('barista (120xxxxxx) mamullerine dokunulmaz; yarı mamul adları "… Bazı 250ml" kalıbında kalır', () => {
    expect(CONCENTRATE_RENAMES.some((r) => r.sku.startsWith('12'))).toBe(false);
    const plan = buildBomPlan(parsed, catalog);
    const ym = plan.newItems.filter((i) => i.type === 'semi_finished').map((i) => i.name);
    expect(ym).toEqual(expect.arrayContaining(['Badem Bazı 250ml', 'Fındık Bazı 250ml', 'Kaju Bazı 250ml']));
    expect(ym.some((n) => /Konsantre/.test(n))).toBe(false);
  });
});

describe('buildBomPlan — eşleme ve çok seviyeli reçete planı', () => {
  it('Badem Sütü Konsantresi örnek ağacı: mamul → Badem Bazı 250ml + 4 ambalaj; yarı mamul → hammaddeler', () => {
    const plan = buildBomPlan(parsed, catalog);
    const mamul = plan.boms.find((b) => b.productSku === '110010001')!;
    expect(mamul.kind).toBe('mamul');
    expect(mamul.lineCode).toBe('HAT1');
    const nameOf = new Map(plan.newItems.map((i) => [i.sku, i.name]));
    expect(mamul.lines.map((l) => nameOf.get(l.sku))).toEqual([
      'Badem Bazı 250ml',
      'Cam Şişe Baştürk Cam Hale 250ml',
      'Tarihli Gold 38mm Twistoff Kapak',
      'Yeniler Etiket Badem Konsantresi 250g Etiket',
      '38 Çap Emniyet Bandı',
    ]);
    const ym = plan.boms.find((b) => b.productSku === '210010000')!;
    expect(ym.kind).toBe('yarimamul');
    expect(ym.outputQty).toBe('100.0000');
    // 250 g × %33 × 100 birim = 8,25 kg
    expect(ym.lines.map((l) => [nameOf.get(l.sku) ?? l.sku, l.qty])).toEqual([
      ['BADEM PUREE', '8.2500'],
      ['Ayçiçek yağı', '8.2500'],
      ['301050000', '8.2500'], // mevcut Kaju SKU'su
    ]);
  });

  it('her mamul ve yarı mamul reçetesinin varsayılan hattı vardır; HAT3 yalnızca saşe/stick', () => {
    const plan = buildBomPlan(parsed, catalog);
    expect(plan.boms.every((b) => ['HAT1', 'HAT2', 'HAT3'].includes(b.lineCode))).toBe(true);
    const hat3 = plan.boms.filter((b) => b.lineCode === 'HAT3').map((b) => b.productSku).sort();
    expect(hat3).toEqual(['150040001', '250040000']);
    expect(plan.boms.find((b) => b.productSku === '130010001')!.lineCode).toBe('HAT2');
    expect(plan.boms.find((b) => b.productSku === '120010001')!.lineCode).toBe('HAT1');
  });

  it('gizli sayfadan türeyen reçeteler YOK: Yulaf Sütü Konsantresi ve Barista Yulaf "reçete yok" kalır, yarı mamulleri açılmaz', () => {
    const plan = buildBomPlan(parsed, catalog);
    const skus = planSkus(plan);
    const bomProducts = new Set(plan.boms.map((b) => b.productSku));
    expect(bomProducts.has('110040001')).toBe(false);
    expect(bomProducts.has('120040001')).toBe(false);
    for (const gone of ['120040001', '210040000', '220040000', '301100000', '401140000']) expect(skus.has(gone)).toBe(false);
    // 110040001 yalnızca set ürünlerinin (türetilen) bileşeni olarak geçebilir
    const usedIn = plan.boms.filter((b) => b.lines.some((l) => l.sku === '110040001')).map((b) => b.productSku).sort();
    expect(usedIn).toEqual(['180010201', '180010301']);
    expect(plan.newItems.map((i) => i.sku)).not.toContain('210040000');
    expect(plan.noRecipeProducts.map((p) => p.sku).sort()).toEqual(['110040001', '120040001']);
    expect(plan.noRecipeProducts.every((p) => p.reason.includes('gizli'))).toBe(true);
    // yarı mamul sayısı: 13 → 11
    expect(plan.boms.filter((b) => b.kind === 'yarimamul')).toHaveLength(11);
    // bu mamuller yer tutucu da DEĞİL
    expect(plan.placeholderProducts.map((p) => p.sku)).not.toContain('110040001');
    expect(plan.placeholderProducts.map((p) => p.sku)).not.toContain('120040001');
  });

  it('protein mix mamulleri görünür "Protein Mix Reçeteleri" sayfasından: PLAIN 94, KAKAO 24, STRAWBERRY 47', () => {
    const plan = buildBomPlan(parsed, catalog);
    const src = (sku: string) => plan.boms.find((b) => b.productSku === sku)!.source;
    expect(src('230010000')).toContain('Plantero Protein Mix Reçeteleri');
    expect(src('230010000')).toContain('satır 94');
    expect(src('230010100')).toContain('satır 24');
    expect(src('230010200')).toContain('satır 47');
    // hiçbir reçete kaynağı gizli bir sayfa adı taşımaz
    const hidden = parsed.skippedHidden.map((n) => n.trim());
    for (const b of plan.boms) for (const h of hidden) expect(b.source.includes(h)).toBe(false);
  });

  it('OATPOWDER 20GR → Oat Coffee Creamer: 10 saşe + oranlar 10 g saşeye ölçeklenir', () => {
    const plan = buildBomPlan(parsed, catalog);
    const mamul = plan.boms.find((b) => b.productSku === '150040001')!;
    expect(mamul.lines.map((l) => [l.sku, l.qty])).toEqual([['250040000', '10.0000'], ['402040000', '10.0000']]);
    const ym = plan.boms.find((b) => b.productSku === '250040000')!;
    // 100 birim × 10 g × %45 = 0,45 kg yulaf tozu
    expect(ym.lines.find((l) => l.sku === '301110000')!.qty).toBe('0.4500');
  });

  it('Excel\'de karşılığı olmayan kalemler T=3/T=4/T=2 koduyla yeni SKU olur; SKU\'lar çakışmaz', () => {
    const plan = buildBomPlan(parsed, catalog);
    const skus = plan.newItems.map((i) => i.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const i of plan.newItems) {
      expect(i.sku).toMatch(/^\d{9}$/);
      expect(i.sku[0]).toBe(i.type === 'raw_material' ? '3' : i.type === 'packaging' ? '4' : '2');
    }
    const existing = new Set(catalog.map((c) => c.sku));
    expect(skus.filter((s) => existing.has(s))).toEqual([]);
    // reçetede geçen her SKU ya katalogda ya yeni kalemlerde
    const known = new Set([...existing, ...skus]);
    expect([...planSkus(plan)].filter((s) => !known.has(s))).toEqual([]);
  });

  it('üretilebilir mamullerin 36\'sı planlanır; kalan 2\'si (Yulaf Sütü Konsantresi, Barista Yulaf) "reçete yok"; yer tutucular ayrıca listelenir', () => {
    const plan = buildBomPlan(parsed, catalog);
    const manufactured = catalog.filter((c) => c.type === 'finished' && c.isManufactured).map((c) => c.sku);
    const planned = new Set(plan.boms.filter((b) => b.kind === 'mamul').map((b) => b.productSku));
    const missing = manufactured.filter((s) => !planned.has(s));
    expect(missing.sort()).toEqual(['110040001', '120040001']);
    expect(missing.sort()).toEqual(plan.noRecipeProducts.map((p) => p.sku).sort());
    expect(planned.size).toBe(36);
    expect(plan.placeholderProducts.length).toBeGreaterThan(0);
    expect(plan.placeholderProducts.map((p) => p.sku)).toContain('160010001');
    expect(plan.placeholderProducts.map((p) => p.sku)).not.toContain('130010001');
  });

  it('KAJUBEAR oranlar toplamı %142 → 1\'e normalize edilir ve notlanır', () => {
    const plan = buildBomPlan(parsed, catalog);
    const ym = plan.boms.find((b) => b.productSku === '240030100')!;
    const sumKg = ym.lines.reduce((a, l) => a + Number(l.qty), 0);
    expect(sumKg).toBeCloseTo(30, 1); // 100 birim × 300 g
    expect(plan.notes.some((n) => n.includes('normalize'))).toBe(true);
  });

  it('eşleme: Cashew/kaju mevcut Kaju SKU\'suna, Almond/Almond Paste BADEM PUREE\'ye bağlanır', () => {
    const plan = buildBomPlan(parsed, catalog);
    const m = (name: string) => plan.matches.find((x) => x.excelName.toLowerCase() === name.toLowerCase());
    expect(m('kaju')?.sku).toBe('301050000');
    expect(m('Cashew')?.status).toBe('matched');
    expect(m('Almond')?.sku).toBe('301070000');
    expect(m('Almond')?.status).toBe('created');
    expect(m('Isolated Pea Protein')?.sku).toBe('301010000');
  });
});

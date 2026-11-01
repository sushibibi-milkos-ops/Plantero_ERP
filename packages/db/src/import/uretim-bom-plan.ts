import Decimal from 'decimal.js';
import { foldKey, findBlock, ingredientLinesOf, type BomBlock, type BomRawLine, type ParsedUretimBom, type RmListItem } from './uretim-bom.js';

/**
 * Üretim Ana Excel'inden çıkan ham blokları (bkz. `uretim-bom.ts`) mevcut ana veriyle eşler ve çok
 * seviyeli reçete planına çevirir. Yalnızca GÖRÜNÜR sayfalardan reçete üretilir (gizli sayfalar okuyucuda
 * atlanır — kullanıcı kararı); görünür sayfada reçetesi olmayan mamul "reçete yok" kalır (`noRecipeProducts`). SAF fonksiyonlar — veritabanına dokunmaz; yazım
 * `seed/uretim-bom.ts` içindedir.
 *
 * ÜRÜN HİYERARŞİSİ (kullanıcı kararı): hammadde (ör. BADEM PUREE) → yarı mamul "Badem Bazı 250ml" (ara ürün)
 * → MAMUL "Badem Sütü Konsantresi" (son ürün, satılabilir).
 * Reçete kalıbı (tüm aileler için aynı):
 *   mamul  → yarı mamul baz (1 birim) + ambalaj kalemleri
 *   yarı mamul → hammaddeler (Excel oranları × birim net ağırlık)
 *
 * Yarı mamul birimi ADET'tir ("Badem Bazı 250ml" = bir şişe dolumluk baz); BOM'u 100 birimlik
 * partiye göre yazılır (kg cinsinden miktarlar 4 ondalıkta kayıpsız kalsın diye).
 *
 * Ürün adları ve barkodlar ASLA normalize edilmez: `foldKey` yalnızca karşılaştırma anahtarıdır.
 */

export type HatCode = 'HAT1' | 'HAT2' | 'HAT3';
export type PlanItemType = 'raw_material' | 'packaging' | 'semi_finished';

export type CatalogProduct = {
  sku: string;
  name: string;
  type: string;
  packQty: number;
  isManufactured: boolean;
  standardCost: string;
};

export type PlanItem = {
  sku: string;
  name: string;
  type: PlanItemType;
  uom: 'KG' | 'ADET';
  category1: string;
  category2: string;
  category3: string;
  shortCode: string;
  shelfLifeDays: number;
  standardCostTL: number | null;
  supplier: string | null;
  excelNames: string[];
  note: string;
};

export type PlanBomLine = { sku: string; qty: string; uom: 'KG' | 'ADET'; note?: string };

export type PlanBom = {
  productSku: string;
  kind: 'mamul' | 'yarimamul';
  /** excel: Excel bloğundan; derived: ürün yapısından türetilen (çoklu paket, set); placeholder: Excel'de reçete yok */
  origin: 'excel' | 'derived' | 'placeholder';
  source: string;
  name: string;
  lineCode: HatCode;
  outputQty: string;
  cycleMinutes: number;
  expectedYieldPct: string;
  overheadPerBatch: string;
  overheadPerUnit: string;
  note: string;
  lines: PlanBomLine[];
};

export type PlanMatch = {
  excelName: string;
  sheet: string;
  block: string;
  supplier: string | null;
  sku: string;
  status: 'matched' | 'created';
  /** matched: mevcut SKU adı */
  skuName: string;
};

export type UretimBomPlan = {
  newItems: PlanItem[];
  /** Mevcut SKU'lar için Excel fiyatı (standardCost 0 ise uygulanır) */
  priceUpdates: Array<{ sku: string; priceTL: number }>;
  boms: PlanBom[];
  matches: PlanMatch[];
  notes: string[];
  /** Excel'de olup hiçbir ürüne bağlanmayan bloklar */
  unusedBlocks: Array<{ sheet: string; title: string; headerRow: number; hidden: boolean; reason: string }>;
  /** Excel'de reçetesi olmayan mamuller (yer tutucu reçete verilenler) */
  placeholderProducts: Array<{ sku: string; name: string }>;
  /** Görünür sayfalarda reçetesi olmayan ve yer tutucu da verilmeyen üretilebilir mamuller: aktif BOM'suz kalır */
  noRecipeProducts: Array<{ sku: string; name: string; reason: string }>;
};

/** Reçetesi yalnızca gizli sayfada bulunan mamuller (kullanıcı kararı: gizli sayfalar dikkate alınmaz → "reçete yok"). */
const HIDDEN_ONLY_REASON: Record<string, string> = {
  '110040001': 'Yulaf Bazı reçetesi yalnızca gizli "OAT 500GR" sayfasındaydı; görünür sayfada yok',
  '120040001': 'Barista Yulaf reçetesi yalnızca gizli "Bitkisel Baz Barista Ana Sheet" sayfasındaydı; görünür sayfada yok',
};

/* ------------------------------------------------------------------ */
/* Eş anlamlı / takma ad tabloları                                     */
/* ------------------------------------------------------------------ */

type Alias = string | RegExp;
const hit = (key: string, aliases: Alias[]): boolean => aliases.some((a) => (typeof a === 'string' ? key === a : a.test(key)));

/** Mevcut hammadde SKU'larına eşlenen Excel adları (foldKey anahtarlarıyla). */
const EXISTING_ALIASES: Array<{ sku: string; aliases: Alias[] }> = [
  { sku: '301010000', aliases: ['isolated pea protein', /^pea protein super fine/] },
  { sku: '301020000', aliases: ['nohut tozu', 'chickpea protein', /^nohut proteini/] },
  { sku: '301050000', aliases: ['kaju', 'cashew', 'kaju nuts'] },
  { sku: '302010000', aliases: ['suklaroz'] },
  { sku: '302020000', aliases: ['stevya', 'stevia'] },
  { sku: '303010000', aliases: ['guar gum'] },
  { sku: '303020000', aliases: ['xhantam gum', 'xhantan gum'] },
  { sku: '304010000', aliases: ['vanilya aromasi'] },
  { sku: '304020000', aliases: ['masker', 'iff masker'] },
  { sku: '304030000', aliases: ['kakao', 'cacao'] },
  { sku: '304040000', aliases: [/^cikolata aromasi/] },
  { sku: '304050000', aliases: [/^cilek aroma verici/] },
  { sku: '305010000', aliases: ['b2 b12 e'] },
  { sku: '306010000', aliases: [/^inulin/, /chicory root fibre/, 'inulin cp'] },
  { sku: '306020000', aliases: ['hibiskus', 'hibiscus'] },
  { sku: '306030000', aliases: ['brokoli ispanak'] },
  { sku: '306040000', aliases: ['spriluna'] },
  { sku: '306050000', aliases: ['bromelain'] },
  { sku: '306060000', aliases: ['strawberry freezedry', 'strawberry'] },
  { sku: '307010000', aliases: ['cream'] },
  { sku: '307020000', aliases: [/^salt\b/, 'deniz tuzu'] },
  { sku: '308020000', aliases: ['matcha tozu'] },
  { sku: '308030000', aliases: ['vanilya tozu', 'madagascar vanilya', 'vanilya madagascar'] },
];

type NewDef = Omit<PlanItem, 'excelNames' | 'standardCostTL' | 'note'> & { aliases: Alias[]; fallbackPriceTL: number | null; rmListMatch?: Alias[] };

const RAW = (sku: string, name: string, shortCode: string, cat2: string, cat3: string, supplier: string | null, aliases: Alias[], fallbackPriceTL: number | null, rmListMatch?: Alias[]): NewDef => ({
  sku, name, type: 'raw_material', uom: 'KG', category1: 'Hammaddeler', category2: cat2, category3: cat3, shortCode, shelfLifeDays: 540, supplier, aliases, fallbackPriceTL, rmListMatch,
});
const PACK = (sku: string, name: string, shortCode: string, cat2: string, cat3: string, supplier: string | null, aliases: Alias[], fallbackPriceTL: number | null, rmListMatch?: Alias[]): NewDef => ({
  sku, name, type: 'packaging', uom: 'ADET', category1: 'Ambalaj Malzemeleri', category2: cat2, category3: cat3, shortCode, shelfLifeDays: 1825, supplier, aliases, fallbackPriceTL, rmListMatch,
});

const KURUYEMIS = 'Kuruyemiş Hammaddeleri';
const PROTEIN_MIX = 'Protein Mix Hammaddeleri';
const CAM_PLASTIK = 'Cam / Plastik Ambalaj';
const ETIKET = 'Baskı / Etiket';
const ESNEK = 'Esnek Ambalaj';

/** Excel'de olup ana veride karşılığı bulunmayan kalemler (T=3 hammadde, T=4 ambalaj) — SKU'lar sabit atanır. */
const NEW_ITEMS: NewDef[] = [
  // --- hammadde (T=3)
  RAW('301070000', 'BADEM PUREE', 'HAM-KYM-05', KURUYEMIS, 'Püre / Ezme', 'AYDIN', ['badem puree', 'almond', 'almond paste', 'almond puree'], 361, ['badem puree']),
  RAW('301080000', 'FINDIK PUREE', 'HAM-KYM-06', KURUYEMIS, 'Püre / Ezme', 'AYDIN', ['findik puree', 'hazelnut puree', 'hazelnut'], 252, ['findik puree']),
  RAW('301090000', 'KAJU EZMESİ', 'HAM-KYM-07', KURUYEMIS, 'Püre / Ezme', 'ümit', ['kaju ezmesi', 'cashew paste'], 360),
  RAW('301110000', 'OAT POWDER', 'HAM-KYM-09', KURUYEMIS, 'Toz', null, ['oatpowder', 'oat powder'], 546, [/^oat powder/]),
  RAW('301120000', 'Kabak Çekirdeği Proteini', 'HAM-PRO-03', PROTEIN_MIX, 'Proteinler', null, ['kabak cekirdegi', 'kabak cekirdegi proteini'], 130),
  RAW('302040000', 'PUDRA ŞEKERİ', 'HAM-TAT-04', PROTEIN_MIX, 'Tatlandırıcılar', 'BİM', ['pudra sekeri', 'seker', 'sugar'], 180),
  RAW('302050000', 'Silent - Fructose', 'HAM-TAT-05', PROTEIN_MIX, 'Tatlandırıcılar', null, ['silent fructose'], null),
  RAW('303030000', 'Physiyum husk', 'HAM-STB-03', PROTEIN_MIX, 'Stabilizatörler', 'Smartiks', ['physiyum husk', 'phylsyium husk', /^pyhlsiyum husk/], 100),
  RAW('304060000', 'FLAVOR FİRMENİCH', 'HAM-ARM-06', PROTEIN_MIX, 'Aromalar & Maskeleyiciler', 'Firmenich', ['flavor firmenich'], 1500),
  RAW('304070000', 'Mouthfeel and Sweet', 'HAM-ARM-07', PROTEIN_MIX, 'Aromalar & Maskeleyiciler', 'Giavuadan', ['moutfeel and sweet', 'mouthfeel and sweet'], 600),
  RAW('304080000', 'CATANOIA COCO', 'HAM-ARM-08', PROTEIN_MIX, 'Aromalar & Maskeleyiciler', 'MOKATE', ['catanoia coco'], 4.9),
  RAW('305020000', 'Calcium Carbonate', 'HAM-VIT-02', PROTEIN_MIX, 'Vitamin & Mineraller', 'CP', ['calcium carbonate', 'calcium karbonate', 'kalsiyum karbonate'], 350),
  RAW('305030000', 'Potassium Phosphate', 'HAM-VIT-03', PROTEIN_MIX, 'Vitamin & Mineraller', null, ['potassium phosphate', 'potasyum fosfat'], 336),
  RAW('306070000', 'Citrus Fiber', 'HAM-FNK-07', PROTEIN_MIX, 'Fonksiyonel & Bitkisel', null, ['citrus fiber', 'citrus fibre'], 2000),
  RAW('307030000', 'Ayçiçek yağı', 'HAM-DGR-03', PROTEIN_MIX, 'Diğer', null, ['aycicek yagi', 'aycicek yag', 'aycicegi yagi', 'sunflower oil'], 42, ['sunflower oil']),
  RAW('307040000', 'COCONUT', 'HAM-DGR-04', PROTEIN_MIX, 'Diğer', null, ['coconut'], 750),
  RAW('307050000', 'CİTRUS', 'HAM-DGR-05', PROTEIN_MIX, 'Diğer', null, ['citrus'], 500),
  // --- ambalaj (T=4)
  PACK('401050000', 'Cam Şişe Baştürk Cam Hale 250ml', 'AMB-KVN-03', CAM_PLASTIK, 'Cam Şişe', 'BAŞTÜRK', ['hale cam sise 250cc'], 5.04, [/^hale cam sise/]),
  PACK('401060000', 'Tarihli Gold 38mm Twistoff Kapak', 'AMB-KVN-04', CAM_PLASTIK, 'Kapak', 'SILGAN BAHARCAM', ['aldin kapak gold', 'metal kapak 38 cap twist off'], 4.62),
  PACK('401070000', 'Yeniler Etiket Badem Konsantresi 250g Etiket', 'AMB-ETK-02', ETIKET, 'Etiket', 'YENİLER ETİKET', [], 1.89, [/^baz etiketleri/, /^yeniler etiket/]),
  PACK('401080000', 'Yeniler Etiket Fındık Konsantresi 250g Etiket', 'AMB-ETK-03', ETIKET, 'Etiket', 'YENİLER ETİKET', [], 1.89, [/^baz etiketleri/, /^yeniler etiket/]),
  PACK('401090000', 'Yeniler Etiket Kaju Konsantresi 250g Etiket', 'AMB-ETK-04', ETIKET, 'Etiket', 'YENİLER ETİKET', [], 1.89, [/^baz etiketleri/, /^yeniler etiket/]),
  PACK('401100000', '38 Çap Emniyet Bandı', 'AMB-EMN-01', ETIKET, 'Emniyet Bandı', null, ['emniyet bandi'], 0.5),
  PACK('401110000', 'AKTEKİN PLASTİK 500CC ŞİŞE 40GR', 'AMB-KVN-05', CAM_PLASTIK, 'Plastik Şişe', 'AKTEKİN', [/^aktekin plastik 500cc/], 8.4, [/^aktekin plastik 500cc/]),
  PACK('401120000', 'PLASTİK POMPA', 'AMB-KVN-06', CAM_PLASTIK, 'Pompa', 'WORKPLAST', ['plastik pompa', '500gr plastic pump'], 26.88, ['plastik pompa']),
  PACK('401130000', 'BARİSTA ETİKETLERİ', 'AMB-ETK-05', ETIKET, 'Etiket', 'ERDAL ETİKET', ['barista etiketleri'], 10),
  PACK('401150000', 'ETİMAG SHİRİNK 50 MİKRON 106*125MM', 'AMB-SHR-01', 'Karton Ambalaj', 'Shrink', 'ETİMAG', [/^etimag shirink/], 0.42, [/^etimag shirink/]),
  PACK('401160000', 'BAŞTÜRK KAVANOZ İZMİR', 'AMB-KVN-07', CAM_PLASTIK, 'Kavanoz', 'BAŞTÜRK', ['basturk kavanoz izmir'], 4.9, [/^basturk kavanoz/]),
  PACK('402040000', 'evepack', 'AMB-SAS-02', ESNEK, 'Saşe', null, ['evepack'], 1.5),
  PACK('402050000', '400GR Protein Mix Ambalajı', 'AMB-DYP-02', ESNEK, 'Doypack', null, [], 10),
  PACK('402060000', 'Matcha 30GR Ambalajı', 'AMB-DYP-03', ESNEK, 'Doypack', null, [], 14),
];

/** Sabit SKU adları (kodda sık kullanılanlar) */
const SKU = {
  badem: '301070000',
  findik: '301080000',
  kajuEzmesi: '301090000',
  oatPowder: '301110000',
  cam250: '401050000',
  kapakGold: '401060000',
  etiketBadem: '401070000',
  etiketFindik: '401080000',
  etiketKaju: '401090000',
  bant: '401100000',
  pet500: '401110000',
  pompa: '401120000',
  etiketBarista: '401130000',
  shrink: '401150000',
  kavanozBasturk: '401160000',
  evepack: '402040000',
  proteinAmb: '402050000',
  matchaAmb: '402060000',
  // mevcut (seed ile gelen) genel ambalajlar
  kapakGenel: '401020000',
  etiketGenel: '401030000',
  koli6: '401040000',
  kavanoz500: '401010000',
} as const;

/* ------------------------------------------------------------------ */
/* Yarı mamul tanımları                                                */
/* ------------------------------------------------------------------ */

type YmDef = { sku: string; name: string; shortCode: string; cat2: string; cat3: string };
const YM = (sku: string, name: string, shortCode: string, cat2: string, cat3: string): YmDef => ({ sku, name, shortCode, cat2, cat3 });

const YM_DEFS: Record<string, YmDef> = {
  badem: YM('210010000', 'Badem Bazı 250ml', 'YMM-BAZ-BDM', 'Bitkisel Süt Konsantreleri (Bazlar)', 'Badem'),
  findik: YM('210020000', 'Fındık Bazı 250ml', 'YMM-BAZ-FND', 'Bitkisel Süt Konsantreleri (Bazlar)', 'Fındık'),
  kaju: YM('210030000', 'Kaju Bazı 250ml', 'YMM-BAZ-KJU', 'Bitkisel Süt Konsantreleri (Bazlar)', 'Kaju'),
  baristaBadem: YM('220010000', 'Barista Badem Bazı 300g', 'YMM-BAR-BDM', 'Barista Serisi', 'Badem'),
  baristaFindik: YM('220020000', 'Barista Fındık Bazı 300g', 'YMM-BAR-FND', 'Barista Serisi', 'Fındık'),
  baristaKaju: YM('220030000', 'Barista Kaju Bazı 300g', 'YMM-BAR-KJU', 'Barista Serisi', 'Kaju'),
  plain: YM('230010000', 'Plain Protein Mix Tozu 416g', 'YMM-PRO-PLN', 'Protein Tozları', 'Protein Mix'),
  choc: YM('230010100', 'Double Chocolate Protein Mix Tozu 416g', 'YMM-PRO-CHC', 'Protein Tozları', 'Protein Mix'),
  straw: YM('230010200', 'Strawberry Protein Mix Tozu 416g', 'YMM-PRO-STR', 'Protein Tozları', 'Protein Mix'),
  kajuEzme: YM('240030100', 'Kakaolu Kaju Ezmesi Bazı 300g', 'YMM-SPR-KJU', 'Sürülebilir Ürünler', 'Kaju'),
  creamer: YM('250040000', 'Oat Creamer Toz Karışımı 10g', 'YMM-CRM-YUL', 'Toz Kremalar', 'Yulaf'),
};

/* ------------------------------------------------------------------ */
/* Reçete tanımları (Excel bloğu → mamul / yarı mamul)                 */
/* ------------------------------------------------------------------ */

type BlockSel = { sheet: string; index?: number; titleIncludes?: string; headerRow?: number; expectFirst?: RegExp };

type Recipe = {
  ym: keyof typeof YM_DEFS;
  block: BlockSel;
  /** Excel oranlarının uygulandığı birim net ağırlık (gram) */
  unitNetG: number;
  line: HatCode;
  /** Mamul SKU'ları (Tekli) ve her birim mamulde kullanılan yarı mamul adedi */
  mamulSkus: string[];
  /** Mamul başına ambalaj (SKU, adet) */
  pack: Array<[string, number]>;
  /** Mamul başına yarı mamul adedi (varsayılan 1) */
  ymPerMamul?: number;
  mamulOverheadPerUnit?: string;
  /** oranlar toplamı > 1.05 ise 1'e normalize et */
  normalize?: boolean;
  /** Yalnızca açıklama: kaynak yorumu */
  comment?: string;
};

const RECIPES: Recipe[] = [
  {
    ym: 'badem', block: { sheet: 'ALMOND 250GR', index: 0, expectFirst: /almond/i }, unitNetG: 250, line: 'HAT1', mamulSkus: ['110010001'],
    pack: [[SKU.cam250, 1], [SKU.kapakGold, 1], [SKU.etiketBadem, 1], [SKU.bant, 1]], mamulOverheadPerUnit: '10',
    comment: 'Kullanıcı örneği: Badem Sütü Konsantresi = Badem Bazı 250ml + cam şişe + kapak + etiket + emniyet bandı',
  },
  {
    ym: 'findik', block: { sheet: '250 gram bitkisel skonsantreler', titleIncludes: 'HAZELNUT KONSANTRE', expectFirst: /hazelnut/i }, unitNetG: 250, line: 'HAT1', mamulSkus: ['110020001'],
    pack: [[SKU.cam250, 1], [SKU.kapakGold, 1], [SKU.etiketFindik, 1], [SKU.bant, 1]], mamulOverheadPerUnit: '10',
  },
  {
    ym: 'kaju', block: { sheet: '250 gram bitkisel skonsantreler', titleIncludes: 'CSAHEW KONSANTRE', index: 0, expectFirst: /cashew/i }, unitNetG: 250, line: 'HAT1', mamulSkus: ['110030001', '110030101'],
    pack: [[SKU.cam250, 1], [SKU.kapakGold, 1], [SKU.etiketKaju, 1], [SKU.bant, 1]], mamulOverheadPerUnit: '10',
  },
  {
    ym: 'baristaBadem', block: { sheet: 'Barista 300GR Complex Citru (2)', titleIncludes: 'Almond Barista', expectFirst: /almond/i }, unitNetG: 300, line: 'HAT1', mamulSkus: ['120010001'],
    pack: [[SKU.pet500, 1], [SKU.pompa, 1], [SKU.etiketBarista, 1]], mamulOverheadPerUnit: '10',
  },
  {
    ym: 'baristaFindik', block: { sheet: 'Barista 300GR Complex Citru (2)', titleIncludes: 'Hazelnut Barista', expectFirst: /hazelnut/i }, unitNetG: 300, line: 'HAT1', mamulSkus: ['120020001'],
    pack: [[SKU.pet500, 1], [SKU.pompa, 1], [SKU.etiketBarista, 1]], mamulOverheadPerUnit: '10',
  },
  {
    ym: 'baristaKaju', block: { sheet: 'Barista 300GR Complex Citru (2)', titleIncludes: 'Cashew Barista', expectFirst: /cashew paste/i }, unitNetG: 300, line: 'HAT1', mamulSkus: ['120030001'],
    pack: [[SKU.pet500, 1], [SKU.pompa, 1], [SKU.etiketBarista, 1]], mamulOverheadPerUnit: '10',
  },
  {
    ym: 'plain', block: { sheet: 'Plantero Protein Mix Reçeteleri', headerRow: 94, expectFirst: /isolated pea/i }, unitNetG: 416, line: 'HAT2', mamulSkus: ['130010001'],
    pack: [[SKU.proteinAmb, 1]],
  },
  {
    ym: 'choc', block: { sheet: 'Plantero Protein Mix Reçeteleri', headerRow: 24, expectFirst: /isolated pea/i }, unitNetG: 416, line: 'HAT2', mamulSkus: ['130010101'],
    pack: [[SKU.proteinAmb, 1]],
  },
  {
    ym: 'straw', block: { sheet: 'Plantero Protein Mix Reçeteleri', headerRow: 47, expectFirst: /isolated pea/i }, unitNetG: 416, line: 'HAT2', mamulSkus: ['130010201'],
    pack: [[SKU.proteinAmb, 1]],
  },
  {
    ym: 'kajuEzme', block: { sheet: 'KAJUBEAR 300GR', index: 0, expectFirst: /kaju ezmesi/i }, unitNetG: 300, line: 'HAT1', mamulSkus: ['140030101'],
    pack: [[SKU.kavanozBasturk, 1], [SKU.kapakGenel, 1], [SKU.etiketGenel, 1]], normalize: true,
  },
  {
    // 150040001 "10gr x 10 saşe": 10 saşe/kutu, saşe başına 10 g (Excel bloğu 20 g'lık parti oranı; oranlar 10 g'a ölçeklenir)
    ym: 'creamer', block: { sheet: 'OATPOWDER 20GR', index: 0, expectFirst: /oatpowder/i }, unitNetG: 10, line: 'HAT3', mamulSkus: ['150040001'],
    pack: [[SKU.evepack, 10]], ymPerMamul: 10,
  },
];

/* ------------------------------------------------------------------ */
/* Yer tutucu reçeteler (Excel'de reçetesi OLMAYAN mamuller)           */
/* ------------------------------------------------------------------ */

type PlaceholderDef = { sku: string; line: HatCode; lines: Array<[string, number, 'KG' | 'ADET']> };

const JAR = (raw: string, rawQty: number, sweet: number, salt: number): Array<[string, number, 'KG' | 'ADET']> => [
  [raw, rawQty, 'KG'], ['302030000', sweet, 'KG'], ['307020000', salt, 'KG'], [SKU.kavanoz500, 1, 'ADET'], [SKU.kapakGenel, 1, 'ADET'], [SKU.etiketGenel, 1, 'ADET'],
];
const COFFEE: Array<[string, number, 'KG' | 'ADET']> = [['308010000', 0.25, 'KG'], ['402030000', 1, 'ADET'], [SKU.etiketGenel, 1, 'ADET']];

const PLACEHOLDERS: PlaceholderDef[] = [
  { sku: '140040001', line: 'HAT1', lines: JAR('301060000', 0.4, 0.05, 0.002) }, // %100 Oat Spredable
  { sku: '140040101', line: 'HAT1', lines: [...JAR('301060000', 0.35, 0.06, 0.002), ['304030000', 0.05, 'KG']] }, // Oat Chocolate Spredable
  { sku: '160010001', line: 'HAT2', lines: COFFEE },
  { sku: '160020001', line: 'HAT2', lines: COFFEE },
  { sku: '160030001', line: 'HAT2', lines: COFFEE },
  { sku: '160040001', line: 'HAT2', lines: COFFEE },
  { sku: '160050001', line: 'HAT2', lines: COFFEE },
  { sku: '160070001', line: 'HAT2', lines: [['308030000', 0.1, 'KG'], ['402010000', 1, 'ADET'], [SKU.etiketGenel, 1, 'ADET']] }, // Vanilya Tozu
  { sku: '160080001', line: 'HAT1', lines: JAR('308040000', 0.3, 0.05, 0.001) }, // Hurma Ezmesi
];

/** Set ürünleri: bileşen mamuller (ürün adından türetilmiş) + etiket */
const SET_COMPONENTS: Record<string, string[]> = {
  '180010101': ['110010001', '110020001', '110030001'],
  '180010201': ['110010001', '110020001', '110040001'],
  '180010301': ['110010001', '110020001', '110040001', '110030001'],
  '180020101': ['130010001', '130010201', '130010101'],
  '180020201': ['110010001', '110020001', '110030001', '130010001', '130010201', '130010101'],
};

const CYCLE: Record<'ym' | 'mamul', Record<HatCode, number>> = {
  ym: { HAT1: 60, HAT2: 45, HAT3: 30 },
  mamul: { HAT1: 30, HAT2: 20, HAT3: 15 },
};

/* ------------------------------------------------------------------ */
/* Plan üretimi                                                        */
/* ------------------------------------------------------------------ */

const dec = (n: number | string): Decimal => new Decimal(n);
const fmt4 = (d: Decimal): string => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);

function selectBlock(parsed: ParsedUretimBom, sel: BlockSel): BomBlock {
  let block: BomBlock | undefined;
  if (sel.headerRow !== undefined) {
    block = parsed.blocks.find((b) => b.sheet.trim().toLowerCase() === sel.sheet.trim().toLowerCase() && b.headerRow === sel.headerRow);
  } else {
    block = findBlock(parsed, sel.sheet, sel.titleIncludes, sel.index ?? 0);
  }
  if (!block) throw new Error(`Excel bloğu bulunamadı: ${sel.sheet} / ${sel.titleIncludes ?? ''} / ${sel.headerRow ?? sel.index ?? 0}`);
  if (sel.expectFirst) {
    const first = block.lines.find((l) => l.qty !== null && (l.ratio ?? 0) > 0);
    if (!first || !sel.expectFirst.test(foldKey(first.name))) throw new Error(`Excel bloğu beklenen yapıda değil (${sel.sheet}): ilk hammadde "${first?.name ?? '-'}"`);
  }
  return block;
}

class Resolver {
  readonly matches: PlanMatch[] = [];
  readonly created = new Map<string, PlanItem>();
  readonly priceUpdates = new Map<string, number>();
  private readonly bySku: Map<string, CatalogProduct>;
  private readonly byName: Map<string, CatalogProduct>;

  constructor(catalog: CatalogProduct[], private readonly rmList: RmListItem[]) {
    this.bySku = new Map(catalog.map((p) => [p.sku, p]));
    this.byName = new Map(catalog.map((p) => [foldKey(p.name), p]));
  }

  private rmPrice(def: Alias[] | undefined): number | null {
    if (!def) return null;
    const row = this.rmList.find((r) => hit(foldKey(r.description), def) && (r.tlPerKg ?? 0) > 0);
    return row?.tlPerKg ?? null;
  }

  /** Excel satır adını SKU'ya çözer; eşleşen yoksa deterministik yeni SKU açar (listede yoksa uyarı notu). */
  resolve(line: Pick<BomRawLine, 'name' | 'supplier' | 'priceTL'>, block: BomBlock, notes: string[]): string {
    const key = foldKey(line.name);
    const price = line.priceTL && line.priceTL > 0 ? line.priceTL : null;

    const ex = EXISTING_ALIASES.find((e) => hit(key, e.aliases));
    if (ex) {
      if (!this.bySku.has(ex.sku)) throw new Error(`Eşleme hedefi ana veride yok: ${ex.sku} (${line.name})`);
      this.record(line, block, ex.sku, 'matched', this.bySku.get(ex.sku)!.name);
      const rm = this.rmPrice(ex.aliases);
      const p = rm ?? price;
      if (p !== null && !this.priceUpdates.has(ex.sku)) this.priceUpdates.set(ex.sku, p);
      return ex.sku;
    }

    const nw = NEW_ITEMS.find((n) => hit(key, n.aliases));
    if (nw) {
      this.ensureCreated(nw, line, block, price);
      return nw.sku;
    }

    const exact = this.byName.get(key);
    if (exact) {
      this.record(line, block, exact.sku, 'matched', exact.name);
      return exact.sku;
    }
    notes.push(`Eşlenemeyen kalem: "${line.name}" (${block.sheet}) — tanım tablosunda yok`);
    throw new Error(`Eşlenemeyen Excel kalemi: "${line.name}" (${block.sheet}). uretim-bom-plan.ts NEW_ITEMS/EXISTING_ALIASES tablosuna ekleyin.`);
  }

  /** SKU ile doğrudan (ambalaj gibi plan tarafından seçilen) yeni kalem; Excel adı/fiyatı bloktan ya da RM Listesi'nden. */
  ensureBySku(sku: string, block: BomBlock | null): void {
    const nw = NEW_ITEMS.find((n) => n.sku === sku);
    if (!nw) return; // mevcut SKU
    this.ensureCreated(nw, null, block, null);
  }

  /** Bloktaki bir ambalaj satırını, planın seçtiği yeni ambalaj SKU'suna bağlar (rapor + Excel adı). */
  linkPackLine(sku: string, line: BomRawLine, block: BomBlock): void {
    const nw = NEW_ITEMS.find((n) => n.sku === sku);
    if (nw) this.ensureCreated(nw, line, block, null);
  }

  private ensureCreated(nw: NewDef, line: Pick<BomRawLine, 'name' | 'supplier' | 'priceTL'> | null, block: BomBlock | null, price: number | null): void {
    let item = this.created.get(nw.sku);
    if (!item) {
      const rm = this.rmPrice(nw.rmListMatch ?? nw.aliases);
      const own = block ? (block.lines.find((l) => nw.aliases.length && hit(foldKey(l.name), nw.aliases) && (l.priceTL ?? 0) > 0)?.priceTL ?? null) : null;
      // fiyat önceliği: tabloda kayıtlı Excel fiyatı (RM Listesi / ilgili sayfa) → RM Listesi → satır fiyatı → blok içi fiyat
      const cost = nw.fallbackPriceTL ?? rm ?? price ?? own;
      item = {
        sku: nw.sku, name: nw.name, type: nw.type, uom: nw.uom, category1: nw.category1, category2: nw.category2, category3: nw.category3,
        shortCode: nw.shortCode, shelfLifeDays: nw.shelfLifeDays, standardCostTL: cost, supplier: nw.supplier, excelNames: [],
        note: 'Üretim Excel\'inden (Plantero_Uretim_Ana_Excel.xlsx) eklendi — ürün adı Excel\'deki gibidir',
      };
      this.created.set(nw.sku, item);
    }
    if (line) {
      if (!item.excelNames.includes(line.name)) item.excelNames.push(line.name);
      this.record(line, block!, nw.sku, 'created', nw.name);
    }
  }

  private record(line: Pick<BomRawLine, 'name' | 'supplier'>, block: BomBlock, sku: string, status: 'matched' | 'created', skuName: string): void {
    this.matches.push({ excelName: line.name, sheet: block.sheet.trim(), block: block.title, supplier: line.supplier, sku, status, skuName });
  }
}

export function buildBomPlan(parsed: ParsedUretimBom, catalog: CatalogProduct[]): UretimBomPlan {
  const notes: string[] = [];
  const bySku = new Map(catalog.map((p) => [p.sku, p]));
  const resolver = new Resolver(catalog, parsed.rmList);
  const boms: PlanBom[] = [];
  const usedBlocks = new Set<BomBlock>();
  const ymCreated = new Map<string, PlanItem>();
  const mamulHasBom = new Set<string>();

  const needProduct = (sku: string): CatalogProduct | null => {
    const p = bySku.get(sku);
    if (!p) notes.push(`Ana veride yok, reçete atlandı: ${sku}`);
    return p ?? null;
  };

  for (const r of RECIPES) {
    const block = selectBlock(parsed, r.block);
    usedBlocks.add(block);
    const ymDef = YM_DEFS[r.ym]!;
    const isPlainBatchSizeNote = block.batch !== null && Math.abs(block.batch - r.unitNetG) > 0.001;

    // --- yarı mamul hammadde satırları
    const ing = ingredientLinesOf(block);
    const totalRatio = ing.reduce((a, l) => a.plus(dec(l.ratio!)), dec(0));
    let factor = dec(1);
    if (r.normalize && totalRatio.gt(1.05)) {
      factor = dec(1).div(totalRatio);
      notes.push(`${block.sheet.trim()} — "${block.title}": oranlar toplamı %${totalRatio.mul(100).toFixed(0)} idi; 1'e normalize edildi (çarpan ${factor.toFixed(4)}). Excel'deki oranlar hatalı olabilir.`);
    } else if (totalRatio.lt(0.95) || totalRatio.gt(1.05)) {
      notes.push(`${block.sheet.trim()} — "${block.title}": oranlar toplamı %${totalRatio.mul(100).toFixed(1)} — normalize edilmedi, Excel'deki gibi uygulandı.`);
    }
    if (isPlainBatchSizeNote) notes.push(`${block.sheet.trim()} — "${block.title}": Excel parti büyüklüğü ${block.batch} (g), reçete ${r.unitNetG} g'lık birime ölçeklendi (oranlar korundu).`);

    const merged = new Map<string, { qtyKg100: Decimal; names: string[] }>();
    for (const l of ing) {
      const sku = resolver.resolve(l, block, notes);
      const qtyKg100 = dec(l.ratio!).mul(factor).mul(r.unitNetG).div(10); // 100 birimlik parti, kg
      const cur = merged.get(sku);
      if (cur) {
        cur.qtyKg100 = cur.qtyKg100.plus(qtyKg100);
        cur.names.push(l.name);
      } else merged.set(sku, { qtyKg100, names: [l.name] });
    }
    const ymLines: PlanBomLine[] = [...merged.entries()].map(([sku, v]) => ({ sku, qty: fmt4(v.qtyKg100), uom: 'KG' as const, note: v.names.length > 1 ? `Excel: ${v.names.join(' + ')}` : undefined }));

    const ymItem: PlanItem = {
      sku: ymDef.sku, name: ymDef.name, type: 'semi_finished', uom: 'ADET', category1: 'Yarı Mamuller', category2: ymDef.cat2, category3: ymDef.cat3,
      shortCode: ymDef.shortCode, shelfLifeDays: 180, standardCostTL: null, supplier: null, excelNames: [block.title],
      note: `Yarı mamul baz — reçete kaynağı: ${block.sheet.trim()} / ${block.title}`,
    };
    ymCreated.set(ymDef.sku, ymItem);

    boms.push({
      productSku: ymDef.sku, kind: 'yarimamul', origin: 'excel', source: `${block.sheet.trim()} › ${block.title} (satır ${block.headerRow})`,
      name: `${ymDef.name} — Reçete`, lineCode: r.line, outputQty: '100.0000', cycleMinutes: CYCLE.ym[r.line], expectedYieldPct: '97',
      overheadPerBatch: '0', overheadPerUnit: '0',
      note: `[uretim-bom] Excel: ${block.sheet.trim()} / ${block.title}; 100 birimlik parti (birim = ${r.unitNetG} g)${r.comment ? `. ${r.comment}` : ''}`,
      lines: ymLines,
    });

    // --- ambalaj kalemlerini oluştur (fiyat/ad Excel'den) ve bloktaki "1 adet" satırlarını bu kalemlere bağla
    for (const [packSku] of r.pack) resolver.ensureBySku(packSku, block);
    for (const l of block.lines.filter((x) => x.qty === null && (x.ratio !== null || x.priceTL !== null))) {
      const target = r.pack.map(([sku]) => NEW_ITEMS.find((n) => n.sku === sku)).find((n) => n && hit(foldKey(l.name), [...n.aliases, ...(n.rmListMatch ?? [])]));
      if (target) resolver.linkPackLine(target.sku, l, block);
      else notes.push(`${block.sheet.trim()} — "${block.title}": ambalaj/adet satırı reçeteye alınmadı: "${l.name}"`);
    }

    // --- mamul reçeteleri
    for (const mSku of r.mamulSkus) {
      const p = needProduct(mSku);
      if (!p) continue;
      const lines: PlanBomLine[] = [
        { sku: ymDef.sku, qty: fmt4(dec(r.ymPerMamul ?? 1)), uom: 'ADET', note: 'Yarı mamul baz' },
        ...r.pack.map(([sku, q]) => ({ sku, qty: fmt4(dec(q)), uom: 'ADET' as const })),
      ];
      boms.push({
        productSku: mSku, kind: 'mamul', origin: 'excel', source: `${block.sheet.trim()} › ${block.title} (satır ${block.headerRow})`,
        name: `${p.name} — Reçete`, lineCode: r.line, outputQty: '1.0000', cycleMinutes: CYCLE.mamul[r.line], expectedYieldPct: '98',
        overheadPerBatch: '0', overheadPerUnit: r.mamulOverheadPerUnit ?? '0',
        note: `[uretim-bom] Yarı mamul ${ymDef.name} + ambalaj. Kaynak: ${block.sheet.trim()} / ${block.title}${r.comment ? `. ${r.comment}` : ''}`,
        lines,
      });
      mamulHasBom.add(mSku);
    }
  }

  // --- Matcha: tek hammadde (yarı mamul yok) + ambalaj
  {
    const block = selectBlock(parsed, { sheet: 'MATCHA POWDER', index: 0, expectFirst: /matcha/i });
    usedBlocks.add(block);
    const line = ingredientLinesOf(block)[0]!;
    const sku = resolver.resolve(line, block, notes);
    resolver.ensureBySku(SKU.matchaAmb, block);
    const p = needProduct('160060001');
    if (p) {
      boms.push({
        productSku: '160060001', kind: 'mamul', origin: 'excel', source: `MATCHA POWDER › ${block.title} (satır ${block.headerRow})`,
        name: `${p.name} — Reçete`, lineCode: 'HAT2', outputQty: '1.0000', cycleMinutes: CYCLE.mamul.HAT2, expectedYieldPct: '98',
        overheadPerBatch: '0', overheadPerUnit: '0',
        note: '[uretim-bom] Tek bileşenli ürün (yeniden paketleme): yarı mamul baz yok; matcha tozu 30 g + ambalaj',
        lines: [{ sku, qty: fmt4(dec(line.qty ?? 30).div(1000)), uom: 'KG', note: '30 g' }, { sku: SKU.matchaAmb, qty: '1.0000', uom: 'ADET' }],
      });
      mamulHasBom.add('160060001');
    }
  }

  // --- türetilen: çoklu paketler (2'li/3'lü/6'lı) — tekli mamul × n + shrink/koli
  const MULTI: Array<{ single: string; multis: Array<[string, number]> }> = [
    { single: '110010001', multis: [['110010002', 2], ['110010003', 3], ['110010006', 6]] },
    { single: '110020001', multis: [['110020002', 2], ['110020003', 3], ['110020006', 6]] },
    { single: '110030001', multis: [['110030002', 2], ['110030003', 3], ['110030006', 6]] },
  ];
  resolver.ensureBySku(SKU.shrink, null);
  for (const g of MULTI) {
    for (const [sku, n] of g.multis) {
      const p = needProduct(sku);
      if (!p) continue;
      const extra: [string, number] = n >= 6 ? [SKU.koli6, 1] : [SKU.shrink, 1];
      boms.push({
        productSku: sku, kind: 'mamul', origin: 'derived', source: `Türetilen: ${n} × ${g.single} (tekli paket)`,
        name: `${p.name} — Reçete`, lineCode: 'HAT1', outputQty: '1.0000', cycleMinutes: 10, expectedYieldPct: '100',
        overheadPerBatch: '0', overheadPerUnit: '2',
        note: `[uretim-bom] Çoklu paket: ${n} adet tekli mamul + ${n >= 6 ? 'dış koli' : 'shrink'} (ürün yapısından türetildi, Excel'de ayrı reçete yok)`,
        lines: [{ sku: g.single, qty: fmt4(dec(n)), uom: 'ADET', note: 'Tekli mamul' }, { sku: extra[0], qty: fmt4(dec(extra[1])), uom: 'ADET' }],
      });
      mamulHasBom.add(sku);
    }
  }

  // --- yer tutucu reçeteler
  const placeholderProducts: Array<{ sku: string; name: string }> = [];
  for (const ph of PLACEHOLDERS) {
    const p = needProduct(ph.sku);
    if (!p) continue;
    for (const [sku] of ph.lines) if (!bySku.has(sku)) throw new Error(`Yer tutucu reçete bileşeni ana veride yok: ${sku}`);
    boms.push({
      productSku: ph.sku, kind: 'mamul', origin: 'placeholder', source: 'Excel\'de reçete yok — yer tutucu',
      name: `${p.name} — Yer Tutucu Reçete`, lineCode: ph.line, outputQty: '1.0000', cycleMinutes: CYCLE.mamul[ph.line], expectedYieldPct: '97',
      overheadPerBatch: '0', overheadPerUnit: '0.5',
      note: '[uretim-bom] YER TUTUCU: Üretim Excel\'inde bu ürün için reçete yok; makul varsayılan reçete (docs/ASSUMPTIONS.md A4). Gerçek reçete girilince yeni versiyonla değiştirin.',
      lines: ph.lines.map(([sku, q, uom]) => ({ sku, qty: fmt4(dec(q)), uom })),
    });
    mamulHasBom.add(ph.sku);
    placeholderProducts.push({ sku: ph.sku, name: p.name });
  }

  // --- set ürünleri (bileşen mamuller)
  for (const [setSku, comps] of Object.entries(SET_COMPONENTS)) {
    const p = needProduct(setSku);
    if (!p) continue;
    const lines: PlanBomLine[] = [];
    const counts = new Map<string, number>();
    for (const c of comps) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const [c, n] of counts) {
      if (!bySku.has(c)) throw new Error(`Set bileşeni ana veride yok: ${c}`);
      lines.push({ sku: c, qty: fmt4(dec(n)), uom: 'ADET', note: 'Set bileşeni' });
    }
    lines.push({ sku: SKU.etiketGenel, qty: '1.0000', uom: 'ADET' });
    boms.push({
      productSku: setSku, kind: 'mamul', origin: 'derived', source: 'Türetilen: set bileşenleri (ürün adından)',
      name: `${p.name} — Reçete`, lineCode: 'HAT2', outputQty: '1.0000', cycleMinutes: 15, expectedYieldPct: '100',
      overheadPerBatch: '0', overheadPerUnit: '2',
      note: '[uretim-bom] Set: bileşen mamullerin tekli paketleri (ürün adından türetildi). Set ürünleri HAT2\'de paketlenir (docs/PRODUCTION-LINES.md varsayımı)',
      lines,
    });
    mamulHasBom.add(setSku);
  }

  // --- Excel'de yeni SKU'su açılan fakat hiçbir BOM'da kullanılmayan kalemleri ele
  const usedSkus = new Set(boms.flatMap((b) => b.lines.map((l) => l.sku)));
  const newItems: PlanItem[] = [...resolver.created.values()].filter((i) => usedSkus.has(i.sku));
  for (const ym of ymCreated.values()) newItems.push(ym);

  // --- kullanılmayan bloklar (rapor için)
  const unusedBlocks = parsed.blocks
    .filter((b) => !usedBlocks.has(b))
    .map((b) => ({ sheet: b.sheet.trim(), title: b.title, headerRow: b.headerRow, hidden: b.hidden, reason: unusedReason(b) }));

  // --- üretilebilir mamul olduğu halde görünür sayfalarda reçetesi çıkmayanlar: aktif BOM'suz ("reçete yok") kalır
  const noRecipeProducts: Array<{ sku: string; name: string; reason: string }> = [];
  for (const p of catalog) {
    if (p.type === 'finished' && p.isManufactured && !mamulHasBom.has(p.sku)) {
      const reason = HIDDEN_ONLY_REASON[p.sku] ?? 'Görünür sayfalarda reçete yok';
      noRecipeProducts.push({ sku: p.sku, name: p.name, reason });
      notes.push(`Reçete yok (aktif BOM açılmadı): ${p.sku} ${p.name} — ${reason}`);
    }
  }

  // fiyat güncellemeleri: fiyat önceliği RM Listesi; mevcut SKU'lar
  const priceUpdates = [...resolver.priceUpdates.entries()].map(([sku, priceTL]) => ({ sku, priceTL }));

  return { newItems, priceUpdates, boms, matches: resolver.matches, notes, unusedBlocks, placeholderProducts, noRecipeProducts };
}

function unusedReason(b: BomBlock): string {
  const s = b.sheet.trim().toLowerCase();
  if (s.startsWith('production worksheet')) return 'Ar-Ge deneme/ara sürüm (Protein Mix Reçeteleri sayfasındaki güncel bloklar kullanıldı; 900/924. satırlar 47/24 ile aynı karışım)';
  if (s.includes('protein mix re')) return 'Karşılık gelen satılabilir mamul yok (Orman Meyveli / Mango / Whey varyantları) ya da PLAIN için tercih edilen blok değil';
  if (s.includes('kajubear')) return 'Vanilyalı ezme varyantı — karşılık gelen mamul yok';
  if (s.includes('konsantre') || s.includes('skonsantre')) return 'Aynı konsantrenin yinelenen bloğu (ilk blok kullanıldı) ya da ayrı reçetesi tercih edilen blok';
  return 'Karşılık gelen mamul yok';
}

/** Plan içindeki tüm SKU'ları (BOM bileşenleri + ürünler) döndürür — doğrulama için. */
export function planSkus(plan: UretimBomPlan): Set<string> {
  const s = new Set<string>();
  for (const b of plan.boms) {
    s.add(b.productSku);
    for (const l of b.lines) s.add(l.sku);
  }
  return s;
}

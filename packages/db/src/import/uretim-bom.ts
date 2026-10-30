import ExcelJS from 'exceljs';

/**
 * Plantero Üretim Ana Excel'i (data/import/Plantero_Uretim_Ana_Excel.xlsx) — reçete (BOM) okuyucu.
 *
 * Çalışma kitabı dağınıktır: ürün başına ayrı sayfalar, bazı sayfalarda alt alta / yan yana
 * birden çok "Bill of Material" bloğu, gizli deneme sayfaları, formül hataları (#N/A, #VALUE!).
 * Bu dosya YALNIZCA okur ve ham blokları çıkarır (DB'ye dokunmaz, eşleme yapmaz):
 *
 *   blok = { sayfa, başlık, parti büyüklüğü, satırlar[{grup, ad, tedarikçi, oran, miktar, fiyatTL}] }
 *
 * Blok tespiti sütun-çapalıdır: "Supplier" başlık hücresi bulunur; hammadde adı hemen solundaki
 * sütundadır; oran/miktar tedarikçi ile "price TL" sütunu arasındaki sayısal hücrelerdir (sırayla
 * oran, miktar; "Price Index" sütunu atlanır). Aynı satırda yan yana birden çok blok olabilir.
 *
 * Oran yorumu: bir bloktaki oranların toplamı 1,5'i aşıyorsa oranlar 0-100 ölçeğindedir (÷100);
 * aksi halde 0-1 ölçeğindedir. Ambalaj/adet satırlarında oran "1 adet" anlamındadır.
 *
 * Eşleme ve BOM oluşturma bu dosyada DEĞİL: `uretim-bom-plan.ts` (saf plan) ve
 * `seed/uretim-bom.ts` (DB yazımı).
 */

/* ------------------------------------------------------------------ */
/* Hücre yardımcıları                                                  */
/* ------------------------------------------------------------------ */

function rawValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    const o = v as unknown as Record<string, unknown>;
    if ('error' in o) return { error: String(o.error) };
    if ('result' in o) return rawValue(o.result as ExcelJS.CellValue);
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((t) => t.text).join('');
    if ('text' in o) return String(o.text);
    return null;
  }
  return v;
}

/** Hücre metni; boş / hata / sayı-dışı nesne → null. Sayılar string'e çevrilir. */
export function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return null; // hata veya tarih
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** "110,00 ₺", "2.000,00 ₺", "0,5", 12.5 → sayı; çözülemezse null. */
export function parseTrNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = cellText(v);
  if (t === null) return null;
  let s = t.replace(/[₺$€\s]/g, '').replace(/TL$/i, '');
  if (s === '' || s === '-') return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Eşleme anahtarı: küçük harf (tr), aksan/noktalama/boşluk sadeleştirilmiş. YALNIZCA karşılaştırma içindir; ürün adları asla bununla değiştirilmez. */
export function foldKey(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Çıktı tipleri                                                       */
/* ------------------------------------------------------------------ */

export type BomRawLine = {
  /** Sayfadaki 1 tabanlı satır no */
  rowNo: number;
  /** nuts / packaging / shipping / flavors / vitamins ... (yoksa null) */
  group: string | null;
  /** Hammadde / ambalaj adı — Excel'deki gibi */
  name: string;
  supplier: string | null;
  /** Normalize oran 0-1 (ambalaj/adet satırında 1 = 1 adet); yoksa null */
  ratio: number | null;
  /** Ham oran (Excel'de yazıldığı gibi) */
  rawRatio: number | null;
  /** Parti içi miktar (parti birimiyle — çoğunlukla gram); yoksa oran × parti */
  qty: number | null;
  priceTL: number | null;
  costTL: number | null;
  /** Ad boşken tedarikçi hücresinden türetildi mi (ör. "shipping | | YENİLER ETİKET") */
  nameFromSupplier: boolean;
};

export type BomBlock = {
  sheet: string;
  hidden: boolean;
  /** Blok başlığı (ürün/reçete adı) — bulunamazsa sayfa adı */
  title: string;
  /** Sayfa içinde bu bloğun başlık satırı */
  headerRow: number;
  /** Sayfadaki 0 tabanlı blok sırası */
  index: number;
  /** Parti büyüklüğü (başlıktaki miktar sütunu; gram varsayımı) */
  batch: number | null;
  ratioScale: 'fraction' | 'percent';
  /** Normalize oranların toplamı (ambalaj/adet satırları hariç değil — ham toplam, bilgilendirme) */
  ratioSum: number;
  lines: BomRawLine[];
};

export type RmListItem = {
  rowNo: number;
  code: string | null;
  description: string;
  supplier: string | null;
  eurPerKg: number | null;
  usdPerKg: number | null;
  tlPerKg: number | null;
};

export type ParsedUretimBom = {
  sheets: Array<{ name: string; hidden: boolean }>;
  blocks: BomBlock[];
  rmList: RmListItem[];
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* Sayfa okuma                                                         */
/* ------------------------------------------------------------------ */

type Grid = { rows: Map<number, unknown[]>; maxRow: number };

function readGrid(ws: ExcelJS.Worksheet): Grid {
  const rows = new Map<number, unknown[]>();
  let maxRow = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
    const arr: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      arr[colNo - 1] = rawValue(cell.value);
    });
    rows.set(rowNo, arr);
    if (rowNo > maxRow) maxRow = rowNo;
  });
  return { rows, maxRow };
}

const GENERIC_TITLES = new Set(['raw material', 'code', 'bill of material', 'supplier', '%', 'price tl', 'rm code']);

function isGenericTitle(s: string | null): boolean {
  if (!s) return true;
  const k = s.toLowerCase().trim();
  if (GENERIC_TITLES.has(k)) return true;
  return /^\d+([.,]\d+)?$/.test(k);
}

type Header = {
  row: number;
  supplierCol: number;
  nameCol: number;
  priceCol: number | null;
  costCol: number | null;
  indexCols: Set<number>;
  title: string | null;
  headerNumbers: number[];
  groupCols: number[];
};

function labelOf(v: unknown): string {
  return (cellText(v) ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findHeaders(grid: Grid): Header[] {
  const headers: Header[] = [];
  for (const [rowNo, cells] of grid.rows) {
    for (let c = 1; c < cells.length; c++) {
      const label = labelOf(cells[c]);
      if (label !== 'supplier') continue;
      const nameCol = c - 1;
      // başlık: ad sütununun solunda (ve ad sütununun kendisinde) genel olmayan ilk metin
      let title: string | null = null;
      const nameHead = cellText(cells[nameCol]);
      if (!isGenericTitle(nameHead)) title = nameHead;
      if (!title) {
        for (let k = nameCol - 1; k >= 0 && k >= nameCol - 3; k--) {
          const t = cellText(cells[k]);
          if (!isGenericTitle(t)) {
            title = t;
            break;
          }
        }
      }
      // fiyat / maliyet sütunu (aynı blok: tedarikçiden sağa, bir sonraki "supplier" başlığına kadar)
      let nextSupplier = cells.length;
      for (let k = c + 1; k < cells.length; k++) {
        if (labelOf(cells[k]) === 'supplier') {
          nextSupplier = k;
          break;
        }
      }
      let priceCol: number | null = null;
      let costCol: number | null = null;
      const indexCols = new Set<number>();
      const headerNumbers: number[] = [];
      for (let k = c + 1; k < nextSupplier; k++) {
        const l = labelOf(cells[k]);
        if (l.includes('index')) indexCols.add(k);
        else if (priceCol === null && /^price tl$/.test(l)) priceCol = k;
        else if (costCol === null && /^cost( kg)? tl$/.test(l)) costCol = k;
        if (priceCol === null) {
          const n = parseTrNumber(cells[k]);
          if (n !== null && !l.includes('index')) headerNumbers.push(n);
        }
      }
      const groupCols: number[] = [];
      for (let k = 0; k < nameCol; k++) groupCols.push(k);
      headers.push({ row: rowNo, supplierCol: c, nameCol, priceCol, costCol, indexCols, title, headerNumbers, groupCols });
    }
  }
  headers.sort((a, b) => a.row - b.row || a.supplierCol - b.supplierCol);
  return headers;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const ENDING_LABEL = /^(total|rm cost|pm cost|lab cost|per packaging|shipping cost|packaging cost)/i;

function extractBlock(sheet: string, hidden: boolean, grid: Grid, h: Header, nextHeaderRow: number, index: number): BomBlock | null {
  const rawLines: BomRawLine[] = [];
  let blankRun = 0;
  const limit = Math.min(nextHeaderRow - 1, h.row + 70, grid.maxRow);
  const numStart = h.supplierCol + 1;
  const numEnd = h.priceCol !== null ? h.priceCol - 1 : h.supplierCol + 3;

  for (let r = h.row + 1; r <= limit; r++) {
    const cells = grid.rows.get(r) ?? [];
    let name = cellText(cells[h.nameCol]);
    const supplier = cellText(cells[h.supplierCol]);
    let group: string | null = null;
    for (const gc of h.groupCols) {
      const g = cellText(cells[gc]);
      if (g && !/^\d+$/.test(g) && !/^[0-9]{5,}/.test(g)) {
        group = g;
        break;
      }
    }

    // ratio / qty: tedarikçi ile fiyat arasındaki sayısal hücreler (Price Index atlanır)
    const nums: number[] = [];
    for (let k = numStart; k <= numEnd; k++) {
      if (h.indexCols.has(k)) continue;
      const n = parseTrNumber(cells[k]);
      if (n !== null) nums.push(n);
    }
    const priceTL = h.priceCol !== null ? parseTrNumber(cells[h.priceCol]) : null;
    const costTL = h.costCol !== null ? parseTrNumber(cells[h.costCol]) : null;

    if (name && ENDING_LABEL.test(name)) break;
    let nameFromSupplier = false;
    if (!name && supplier && (nums.length || priceTL !== null) && group) {
      name = supplier;
      nameFromSupplier = true;
    }
    if (!name || name.toLowerCase() === 'none') {
      blankRun++;
      if (blankRun >= 3 && rawLines.length) break;
      continue;
    }
    blankRun = 0;
    // sayısal hiçbir veri yoksa ve grup/etiket metniyse (ör. "Ph", "UHT") satırı atla
    if (nums.length === 0 && priceTL === null && costTL === null && !supplier) continue;

    rawLines.push({
      rowNo: r,
      group,
      name,
      supplier: nameFromSupplier ? null : supplier,
      ratio: null,
      rawRatio: nums[0] ?? null,
      qty: nums.length > 1 ? (nums[1] ?? null) : null,
      priceTL,
      costTL,
      nameFromSupplier,
    });
  }

  // en az 1 sayısal veri taşıyan satır yoksa blok boştur (deneme ızgarasındaki yan başlıklar)
  const useful = rawLines.filter((l) => l.rawRatio !== null && l.rawRatio > 0);
  if (useful.length < 1) return null;

  // parti büyüklüğü: başlıktaki sayılardan ya da oran×miktar tutarlılığından
  const impliedBatches = rawLines
    .filter((l) => l.rawRatio !== null && l.rawRatio > 0 && l.rawRatio <= 100 && l.qty !== null && l.qty > 0 && l.rawRatio !== 1)
    .flatMap((l) => {
      const asFraction = l.qty! / l.rawRatio!;
      const asPercent = (l.qty! / l.rawRatio!) * 100;
      return [asFraction, asPercent];
    });
  let batch: number | null = null;
  const headerCandidates = h.headerNumbers.filter((n) => n > 1);
  for (const cand of [...headerCandidates].reverse()) {
    // aday, en az iki satırda oran×aday ≈ miktar ya da oran×aday/100 ≈ miktar vermeli
    const hits = rawLines.filter((l) => l.rawRatio !== null && l.qty !== null && l.qty > 0 && (Math.abs(l.rawRatio * cand - l.qty) <= 0.02 * l.qty + 0.01 || Math.abs((l.rawRatio * cand) / 100 - l.qty) <= 0.02 * l.qty + 0.01)).length;
    if (hits >= 1) {
      batch = cand;
      break;
    }
  }
  if (batch === null) batch = headerCandidates.length ? headerCandidates[headerCandidates.length - 1]! : median(impliedBatches.filter((x) => x > 1));

  // oran ölçeği: ambalaj/adet (ratio==1, miktar yok) satırlar hariç oran toplamı
  // "1" oranı + miktarsız satır = adet satırı (ambalaj); oran toplamına girmez
  const isUnitLine = (l: BomRawLine): boolean => l.rawRatio === 1 && l.qty === null;
  const ingredientRatios = rawLines.filter((l) => l.rawRatio !== null && !isUnitLine(l)).map((l) => l.rawRatio!);
  const sum = ingredientRatios.reduce((a, b) => a + b, 0);
  const ratioScale: 'fraction' | 'percent' = sum > 1.5 && Math.max(...ingredientRatios, 0) > 1 ? 'percent' : 'fraction';

  const lines = rawLines.map((l) => {
    let ratio: number | null = l.rawRatio;
    if (ratio !== null && ratioScale === 'percent') ratio = ratio / 100;
    let qty = l.qty;
    if (qty === null && ratio !== null && batch !== null && !isUnitLine(l)) qty = ratio * batch;
    return { ...l, ratio, qty };
  });

  return {
    sheet,
    hidden,
    title: h.title ?? sheet.trim(),
    headerRow: h.row,
    index,
    batch,
    ratioScale,
    ratioSum: sum,
    lines,
  };
}

function parseRmList(grid: Grid): RmListItem[] {
  const items: RmListItem[] = [];
  const header = grid.rows.get(1) ?? [];
  const col = (re: RegExp): number => header.findIndex((v) => re.test(labelOf(v)));
  const cCode = col(/rm code/);
  const cDesc = col(/description/);
  const cSup = col(/supplier/);
  const cEur = col(/euro/);
  const cUsd = col(/usd/);
  const cTl = col(/tl\/kg|tl \/kg/);
  for (const [rowNo, cells] of grid.rows) {
    if (rowNo === 1) continue;
    const description = cDesc >= 0 ? cellText(cells[cDesc]) : null;
    if (!description) continue;
    items.push({
      rowNo,
      code: cCode >= 0 ? cellText(cells[cCode]) : null,
      description,
      supplier: cSup >= 0 ? cellText(cells[cSup]) : null,
      eurPerKg: cEur >= 0 ? parseTrNumber(cells[cEur]) : null,
      usdPerKg: cUsd >= 0 ? parseTrNumber(cells[cUsd]) : null,
      tlPerKg: cTl >= 0 ? parseTrNumber(cells[cTl]) : null,
    });
  }
  return items;
}

/** Üretim Ana Excel'ini okur: tüm sayfalar (gizliler dahil) taranır, reçete blokları + RM fiyat listesi döner. */
export async function parseUretimBom(buffer: Buffer | ArrayBuffer | Uint8Array): Promise<ParsedUretimBom> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const warnings: string[] = [];
  const sheets: ParsedUretimBom['sheets'] = [];
  const blocks: BomBlock[] = [];
  let rmList: RmListItem[] = [];

  for (const ws of wb.worksheets) {
    const hidden = ws.state !== 'visible';
    sheets.push({ name: ws.name, hidden });
    const grid = readGrid(ws);
    if (ws.name.trim().toLowerCase() === 'rm list') {
      rmList = parseRmList(grid);
      continue;
    }
    const headers = findHeaders(grid);
    let idx = 0;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]!;
      // bir sonraki başlık: aynı ad sütunu üzerinde, aşağıda
      const next = headers.find((o) => o !== h && o.row > h.row && Math.abs(o.nameCol - h.nameCol) <= 1);
      const block = extractBlock(ws.name, hidden, grid, h, next ? next.row : grid.maxRow + 1, idx);
      if (block) {
        blocks.push(block);
        idx++;
      }
    }
  }
  if (rmList.length === 0) warnings.push('RM List sayfası bulunamadı ya da boş');
  return { sheets, blocks, rmList, warnings };
}

/** Sayfa + (kısmi) başlık ile blok seçer. `index` aynı başlıkla birden çok blok varsa kaçıncısı (0 tabanlı). */
export function findBlock(parsed: ParsedUretimBom, sheet: string, titleIncludes?: string, index = 0): BomBlock | undefined {
  const sheetKey = sheet.trim().toLowerCase();
  const matches = parsed.blocks.filter((b) => b.sheet.trim().toLowerCase() === sheetKey && (titleIncludes === undefined || foldKey(b.title).includes(foldKey(titleIncludes))));
  return matches[index];
}

/** Karışımda hammadde sayılan satırlar: miktarı olan, oranı > 0, su/"None" olmayan. Miktarsız "1 adet" satırları ambalajdır. */
export function ingredientLinesOf(block: BomBlock): BomRawLine[] {
  return block.lines.filter((l) => l.qty !== null && l.ratio !== null && l.ratio > 0 && !/^water\b/i.test(l.name) && foldKey(l.name) !== 'none');
}

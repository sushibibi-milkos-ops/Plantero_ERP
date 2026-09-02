import { D, toDb } from '@plantero/core';
import type { BankTx, CsvColumnMapping } from '../types.js';

/**
 * Türk bankası CSV ekstre çözümleyici. Varsayılan kolonlar: "Tarih;Açıklama;Tutar;Bakiye".
 * `mapping` ile kolon adları, ayraç, tarih biçimi ve ondalık ayracı özelleştirilebilir.
 */

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeNumber(raw: string, decimalSeparator: ',' | '.'): string {
  let s = raw.trim().replace(/\s/g, '');
  const negative = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/^[-(]+|[)]+$/g, '');
  s = decimalSeparator === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return negative ? `-${s}` : s;
}

function parseCsvDate(raw: string, format: NonNullable<CsvColumnMapping['dateFormat']>): string {
  if (format === 'YYYY-MM-DD') return raw.trim();
  const sep = format.includes('.') ? '.' : '/';
  const [d, m, y] = raw.trim().split(sep);
  if (!d || !m || !y) throw new Error(`CSV: geçersiz tarih değeri: "${raw}"`);
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function parseCsv(text: string, mapping: CsvColumnMapping = {}): BankTx[] {
  const delimiter = mapping.delimiter ?? ';';
  const dateColumn = mapping.dateColumn ?? 'Tarih';
  const descriptionColumn = mapping.descriptionColumn ?? 'Açıklama';
  const amountColumn = mapping.amountColumn ?? 'Tutar';
  const balanceColumn = mapping.balanceColumn ?? 'Bakiye';
  const dateFormat = mapping.dateFormat ?? 'DD.MM.YYYY';
  const decimalSeparator = mapping.decimalSeparator ?? ',';
  const hasHeader = mapping.hasHeader ?? true;

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  let header: string[];
  let dataLines: string[];
  if (hasHeader) {
    header = splitCsvLine(lines[0]!, delimiter).map((h) => h.trim());
    dataLines = lines.slice(1);
  } else {
    header = [dateColumn, descriptionColumn, amountColumn, balanceColumn];
    dataLines = lines;
  }

  const idx = (col: string) => header.findIndex((h) => h.toLocaleLowerCase('tr').trim() === col.toLocaleLowerCase('tr').trim());
  const iDate = idx(dateColumn);
  const iDesc = idx(descriptionColumn);
  const iAmount = idx(amountColumn);
  const iBalance = idx(balanceColumn);

  if (iDate === -1 || iDesc === -1 || iAmount === -1) {
    throw new Error(`CSV eşleme hatası: '${dateColumn}', '${descriptionColumn}' veya '${amountColumn}' kolonu bulunamadı`);
  }

  return dataLines.map((line, i) => {
    const cells = splitCsvLine(line, delimiter);
    const dateRaw = cells[iDate]?.trim() ?? '';
    const description = cells[iDesc]?.trim() ?? '';
    const amountRaw = cells[iAmount]?.trim() ?? '0';
    const balanceRaw = iBalance >= 0 ? cells[iBalance]?.trim() : undefined;

    const txDate = parseCsvDate(dateRaw, dateFormat);
    const amount = toDb(D(normalizeNumber(amountRaw, decimalSeparator)));
    const balanceAfter = balanceRaw ? toDb(D(normalizeNumber(balanceRaw, decimalSeparator))) : undefined;

    const tx: BankTx = {
      externalRef: `CSV-${txDate}-${hashText(`${description}|${amountRaw}|${i}`)}`,
      txDate,
      amount,
      currency: 'TRY',
      description,
    };
    if (balanceAfter) tx.balanceAfter = balanceAfter;
    return tx;
  });
}

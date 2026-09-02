import { D, toDb } from '@plantero/core';
import type { BankTx, Mt940Balance, Mt940ParseResult } from '../types.js';

/**
 * SWIFT MT940 ekstre çözümleyici. Alanlar:
 * :20: işlem referansı, :25: hesap (IBAN), :28C: ekstre no,
 * :60F: açılış bakiyesi, :61: hareket satırı, :86: hareket açıklaması, :62F: kapanış bakiyesi.
 */

type RawField = { tag: string; value: string };

function tokenize(text: string): RawField[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const fields: RawField[] = [];
  for (const line of lines) {
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (m) {
      fields.push({ tag: m[1]!, value: m[2]! });
    } else if (fields.length > 0 && line.trim().length > 0) {
      fields[fields.length - 1]!.value += ` ${line.trim()}`;
    }
  }
  return fields;
}

function yymmddToIso(s: string): string {
  const year = 2000 + Number(s.slice(0, 2));
  const month = s.slice(2, 4);
  const day = s.slice(4, 6);
  return `${year}-${month}-${day}`;
}

function mmddToIso(s: string, year: number): string {
  const month = s.slice(0, 2);
  const day = s.slice(2, 4);
  return `${year}-${month}-${day}`;
}

function parseBalanceField(value: string): Mt940Balance {
  const m = /^([DC])(\d{6})([A-Z]{3})([\d,]+)$/.exec(value.trim());
  if (!m) throw new Error(`MT940: bakiye alanı çözümlenemedi: "${value}"`);
  const [, mark, date, currency, amount] = m as unknown as [string, 'D' | 'C', string, string, string];
  return { mark, amount: toDb(D(amount.replace(',', '.'))), date: yymmddToIso(date), currency };
}

/** :86: metnindeki "?NN" alt alan işaretleyicilerini ve önündeki işlem kodunu temizler */
function cleanNarrative(raw: string): string {
  const withoutLeadingCode = raw.replace(/^\d{2,3}/, '');
  return withoutLeadingCode
    .replace(/\?\d{2}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStatementLine(value: string, fallbackRefBase: string, seq: number): BankTx {
  const m = /^(\d{6})(\d{4})?(R?[DC])(\d+,\d{1,2})([A-Z][A-Z0-9]{1,3})?(.*)$/.exec(value.trim());
  if (!m) throw new Error(`MT940: hareket satırı çözümlenemedi: "${value}"`);
  const [, valueDateRaw, entryDateRaw, mark, amountRaw, txType, rest] = m as unknown as [
    string, string, string | undefined, string, string, string | undefined, string,
  ];

  const valueDate = yymmddToIso(valueDateRaw);
  const year = Number(valueDate.slice(0, 4));
  const txDate = entryDateRaw ? mmddToIso(entryDateRaw, year) : valueDate;

  // D = borç (çıkış, negatif); C = alacak (giriş, pozitif); RD/RC = storno (işareti ters çevirir)
  const isDebit = mark === 'D' || mark === 'RC';
  const amount = D(amountRaw.replace(',', '.')).mul(isDebit ? -1 : 1);

  const trimmedRest = rest.trim();
  const [refPart, bankRefPart] = trimmedRest.split('//').map((s) => s.trim());
  const externalRef = (bankRefPart || refPart || `${fallbackRefBase}-${seq}`).slice(0, 200);

  return {
    externalRef,
    txDate,
    valueDate,
    amount: toDb(amount),
    currency: '',
    description: '',
    txType,
  };
}

export function parseMt940(text: string): Mt940ParseResult {
  const fields = tokenize(text);

  let statementRef = '';
  let accountIban = '';
  let statementNo: string | undefined;
  let opening: Mt940Balance | null = null;
  let closing: Mt940Balance | null = null;
  const transactions: BankTx[] = [];
  let pending: BankTx | null = null;
  let seq = 0;

  for (const f of fields) {
    switch (f.tag) {
      case '20':
        statementRef = f.value.trim();
        break;
      case '25':
        accountIban = f.value.trim();
        break;
      case '28C':
        statementNo = f.value.trim();
        break;
      case '60F':
      case '60M':
        opening = parseBalanceField(f.value);
        break;
      case '62F':
      case '62M':
        closing = parseBalanceField(f.value);
        break;
      case '61': {
        if (pending) transactions.push(pending);
        seq += 1;
        pending = parseStatementLine(f.value, statementRef || 'MT940', seq);
        pending.currency = opening?.currency ?? 'TRY';
        break;
      }
      case '86': {
        if (pending) pending.description = cleanNarrative(f.value);
        break;
      }
      default:
        break;
    }
  }
  if (pending) transactions.push(pending);

  if (!accountIban) throw new Error('MT940: :25: hesap alanı bulunamadı');
  if (!opening) throw new Error('MT940: :60F: açılış bakiyesi bulunamadı');
  if (!closing) throw new Error('MT940: :62F: kapanış bakiyesi bulunamadı');

  return { statementRef, accountIban, statementNo, openingBalance: opening, closingBalance: closing, transactions };
}

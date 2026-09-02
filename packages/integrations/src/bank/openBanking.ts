import { D, round2, toDb } from '@plantero/core';
import { isoDate, seededRandom, startOfUtcDay } from '../lib/prng.js';
import type { BankProvider, BankTx, IntegrationMode } from '../types.js';

/**
 * Açık bankacılık (Open Banking) adaptörü.
 * `OPEN_BANKING_API_KEY` env'de yoksa sandbox: hesap koduna ve tarihe göre deterministik
 * hareketler üretir (müşteri tahsilatı, gider ödemesi, banka masrafı karışımı).
 */

const computeMode = (): IntegrationMode => (process.env.OPEN_BANKING_API_KEY ? 'live' : 'sandbox');

const MAX_SANDBOX_DAYS = 30;

const INBOUND_DESCRIPTIONS = [
  'Havale Gelen - Migros Ticaret A.Ş.',
  'EFT Gelen - CarrefourSA Carrefour Sabancı Tic. Merkezi',
  'Havale Gelen - Şok Marketler Tic. A.Ş.',
  'Trendyol Hakediş Ödemesi',
  'Hepsiburada Hakediş Ödemesi',
  'EFT Gelen - Yerel Bayi Ödemesi',
];

const OUTBOUND_DESCRIPTIONS = [
  'EFT Giden - Hammadde Tedarikçisi Ödemesi',
  'Havale Giden - Ambalaj Tedarikçisi',
  'Kredi Taksit Ödemesi',
  'SGK Prim Ödemesi',
  'Personel Maaş Ödemesi',
  'Elektrik Faturası Ödemesi',
];

const FEE_DESCRIPTIONS = ['Hesap İşletim Ücreti', 'EFT Masrafı', 'Havale Komisyonu', 'BSMV Kesintisi'];

function sandboxTransactionsForDay(accountCode: string, dateStr: string): BankTx[] {
  const rnd = seededRandom(`openbanking-${accountCode}-${dateStr}`);
  const txCount = 1 + Math.floor(rnd() * 4); // günde 1-4 hareket
  const out: BankTx[] = [];

  for (let i = 0; i < txCount; i++) {
    const roll = rnd();
    let amount: ReturnType<typeof D>;
    let description: string;
    let txType: string;

    if (roll < 0.08) {
      amount = round2(D(-(15 + rnd() * 200)));
      description = FEE_DESCRIPTIONS[Math.floor(rnd() * FEE_DESCRIPTIONS.length)]!;
      txType = 'fee';
    } else if (roll < 0.5) {
      amount = round2(D(500 + rnd() * 49500));
      description = INBOUND_DESCRIPTIONS[Math.floor(rnd() * INBOUND_DESCRIPTIONS.length)]!;
      txType = 'transfer';
    } else {
      amount = round2(D(-(300 + rnd() * 39700)));
      description = OUTBOUND_DESCRIPTIONS[Math.floor(rnd() * OUTBOUND_DESCRIPTIONS.length)]!;
      txType = description.includes('Kredi') ? 'loan_installment' : 'transfer';
    }

    out.push({
      externalRef: `OB-${accountCode}-${dateStr.replace(/-/g, '')}-${String(i + 1).padStart(2, '0')}`,
      txDate: dateStr,
      valueDate: dateStr,
      amount: toDb(amount),
      currency: 'TRY',
      description,
      txType,
    });
  }

  return out;
}

async function sandboxFetchTransactions(accountCode: string, since: Date): Promise<BankTx[]> {
  const startDay = startOfUtcDay(since);
  const endDay = startOfUtcDay(new Date());
  const transactions: BankTx[] = [];
  for (let d = new Date(startDay), dayIdx = 0; d <= endDay && dayIdx < MAX_SANDBOX_DAYS; d.setUTCDate(d.getUTCDate() + 1), dayIdx++) {
    transactions.push(...sandboxTransactionsForDay(accountCode, isoDate(d)));
  }
  return transactions;
}

async function liveFetchTransactions(account: { code: string; iban?: string; accountNo?: string }, since: Date): Promise<BankTx[]> {
  const base = process.env.OPEN_BANKING_API_BASE_URL ?? 'https://api.openbanking.example.com';
  const res = await fetch(`${base}/accounts/${account.iban ?? account.accountNo}/transactions?since=${since.toISOString()}`, {
    headers: { Authorization: `Bearer ${process.env.OPEN_BANKING_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Açık bankacılık hareketleri alınamadı: HTTP ${res.status}`);
  const data = (await res.json()) as { transactions?: Array<Record<string, unknown>> };
  return (data.transactions ?? []).map((t) => ({
    externalRef: String(t.id ?? t.reference ?? ''),
    txDate: String(t.bookingDate ?? t.date ?? ''),
    valueDate: t.valueDate ? String(t.valueDate) : undefined,
    amount: String(t.amount ?? '0'),
    currency: String(t.currency ?? 'TRY'),
    description: String(t.description ?? t.remittanceInformation ?? ''),
    counterpartyName: t.counterpartyName ? String(t.counterpartyName) : undefined,
    counterpartyIban: t.counterpartyIban ? String(t.counterpartyIban) : undefined,
    raw: t,
  }));
}

export const openBanking: BankProvider = {
  get mode() {
    return computeMode();
  },
  fetchTransactions: (account, since) =>
    computeMode() === 'sandbox' ? sandboxFetchTransactions(account.code, since) : liveFetchTransactions(account, since),
};

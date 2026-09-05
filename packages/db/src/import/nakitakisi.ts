import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import type { DbOrTx } from '../client.js';
import { loans, loanInstallments, fixedExpenses, cashflowAssumptions, channelAssumptions, accounts, bankAccounts, salesChannels } from '../schema/index.js';

/**
 * Bigetaş Nakit Akışı & Ciro Hedefi Excel içe aktarımı.
 * Kaynak: data/import/Bigetas_Nakit_Akisi_Ciro_Hedefi.xlsx — 'Krediler', 'Kredi Takvimi', 'Varsayımlar' sayfaları.
 * Excel formüllü hücreler exceljs'de `{ formula, result }` olarak gelir — cached `result` kullanılır.
 */

const money4 = (v: number | string | Decimal | null | undefined) => new Decimal(v ?? 0).toFixed(4);
const pctFromFraction = (v: number | string | Decimal | null | undefined) => new Decimal(v ?? 0).mul(100).toFixed(4);

function cellVal(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === 'object' && 'result' in (v as Record<string, unknown>)) return (v as { result: unknown }).result;
  if (v && typeof v === 'object' && 'formula' in (v as Record<string, unknown>) && !('result' in (v as Record<string, unknown>))) return null;
  return v;
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
    const n2 = Number(v);
    return Number.isFinite(n2) ? n2 : 0;
  }
  return 0;
}

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** "21.05.2025" biçimi (nokta ayraçlı, gün.ay.yıl) → UTC Date */
function parseTrDate(v: unknown): Date | null {
  const s = asText(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

const TR_MONTH_ABBR: Record<string, number> = {
  Oca: 1, Şub: 2, Mar: 3, Nis: 4, May: 5, Haz: 6, Tem: 7, Ağu: 8, Eyl: 9, Eki: 10, Kas: 11, Ara: 12,
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const makeDueDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))));

const LOAN_CODES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] as const;
export type LoanCode = (typeof LOAN_CODES)[number];

export type ParsedLoan = {
  code: LoanCode;
  bankName: string;
  productName: string;
  reference: string | null;
  principal: string;
  currency: 'TRY';
  openedAt: Date;
  termMonths: number;
  monthlyRatePct: string;
  rateKind: 'fixed' | 'variable';
  monthlyInstallment: string;
  paymentDay: number;
  firstRemainingDue: Date | null;
  lastDue: Date | null;
  remainingPrincipal: string;
  remainingInstallments: number;
};

export type ParsedLoanInstallment = {
  loanCode: LoanCode;
  seq: number;
  dueDate: Date;
  period: string;
  installment: string;
  interest: string;
  principal: string;
  remainingAfter: string;
};

export type ParsedFixedExpense = {
  code: string;
  name: string;
  category: 'rent' | 'personnel' | 'energy' | 'marketing' | 'admin' | 'finance' | 'other';
  monthlyAmount: string;
  includesVat: boolean;
  accountCode: string;
  sortOrder: number;
};

export type ParsedAssumption = { key: string; value: string; label: string; description: string | null };

export const CHANNEL_CODES = ['TRENDYOL', 'TOPTAN', 'HAMMADDE', 'MIGROS'] as const;
export type ParsedChannelAssumption = {
  channelCode: (typeof CHANNEL_CODES)[number];
  monthlyRevenue: string;
  contributionMarginPct: string;
  collectionLagMonths: number;
  source: string | null;
};

export type ParsedNakitAkisi = {
  loans: ParsedLoan[];
  installments: ParsedLoanInstallment[];
  fixedExpenses: ParsedFixedExpense[];
  assumptions: ParsedAssumption[];
  channels: ParsedChannelAssumption[];
  warnings: string[];
};

/** Kredi Takvimi sayfasında her kredinin (Taksit, Faiz+BSMV, Anapara) üçlüsünün başladığı kolon (Krediler satır sırasıyla aynı) */
const LOAN_SCHEDULE_START_COL = [3, 7, 10, 13, 16, 19, 22]; // L1..L7

const FIXED_EXPENSE_ROWS: Array<{ row: number; code: string; category: ParsedFixedExpense['category'] }> = [
  { row: 14, code: 'kira_fabrika', category: 'rent' },
  { row: 15, code: 'osb_aidat', category: 'rent' },
  { row: 16, code: 'personel_maas', category: 'personnel' },
  { row: 17, code: 'personel_sgk_stopaj', category: 'personnel' },
  { row: 18, code: 'personel_parttime', category: 'personnel' },
  { row: 19, code: 'enerji', category: 'energy' },
  { row: 20, code: 'muhasebe_mali_musavir', category: 'admin' },
  { row: 21, code: 'yazilim_abonelik', category: 'admin' },
  { row: 22, code: 'sigorta', category: 'admin' },
  { row: 23, code: 'bakim_temizlik_guvenlik', category: 'admin' },
  { row: 24, code: 'internet_telefon', category: 'admin' },
  { row: 25, code: 'belge_analiz_sertifika', category: 'admin' },
  { row: 26, code: 'pazarlama_ajans', category: 'marketing' },
  { row: 27, code: 'reklam_butcesi', category: 'marketing' },
  { row: 28, code: 'banka_masraflari', category: 'finance' },
];

const CHANNEL_ROWS: Array<{ row: number; code: (typeof CHANNEL_CODES)[number] }> = [
  { row: 33, code: 'TRENDYOL' }, // "E-ticaret (Trendyol, Hepsiburada, kendi site)" — tek satırda toplu, üçe bölünmez
  { row: 34, code: 'TOPTAN' },
  { row: 35, code: 'HAMMADDE' },
  { row: 36, code: 'MIGROS' },
];

export async function parseNakitAkisi(buffer: Buffer | ArrayBuffer): Promise<ParsedNakitAkisi> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const krediler = wb.getWorksheet('Krediler');
  const takvim = wb.getWorksheet('Kredi Takvimi');
  const varsayimlar = wb.getWorksheet('Varsayımlar');
  if (!krediler || !takvim || !varsayimlar) throw new Error("'Krediler', 'Kredi Takvimi' veya 'Varsayımlar' sayfası bulunamadı");

  /* ---------------- Krediler ---------------- */
  const parsedLoans: ParsedLoan[] = [];
  for (let i = 0; i < LOAN_CODES.length; i++) {
    const r = 5 + i; // veri satırları 5..11
    const row = krediler.getRow(r);
    const code = LOAN_CODES[i];
    if (!code) continue;
    const bankName = asText(cellVal(row.getCell(2))) ?? '';
    if (!bankName) {
      warnings.push(`Krediler satır ${r}: banka adı boş — kredi atlandı`);
      continue;
    }
    const rateKind = (asText(cellVal(row.getCell(9))) ?? '').toLocaleUpperCase('tr-TR') === 'DEĞİŞKEN' ? 'variable' : 'fixed';
    parsedLoans.push({
      code,
      bankName,
      productName: asText(cellVal(row.getCell(3))) ?? '',
      reference: asText(cellVal(row.getCell(4))),
      principal: money4(asNumber(cellVal(row.getCell(5)))),
      currency: 'TRY',
      openedAt: parseTrDate(cellVal(row.getCell(6))) ?? new Date(),
      termMonths: Math.round(asNumber(cellVal(row.getCell(7)))),
      monthlyRatePct: pctFromFraction(asNumber(cellVal(row.getCell(8)))),
      rateKind,
      monthlyInstallment: money4(asNumber(cellVal(row.getCell(10)))),
      paymentDay: Math.round(asNumber(cellVal(row.getCell(17)))),
      firstRemainingDue: parseTrDate(cellVal(row.getCell(12))),
      lastDue: parseTrDate(cellVal(row.getCell(13))),
      remainingPrincipal: money4(asNumber(cellVal(row.getCell(14)))),
      remainingInstallments: Math.round(asNumber(cellVal(row.getCell(11)))),
    });
  }

  /* ---------------- Kredi Takvimi ---------------- */
  const installments: ParsedLoanInstallment[] = [];
  const runningBalance = new Map<LoanCode, Decimal>();
  for (const l of parsedLoans) runningBalance.set(l.code, new Decimal(l.remainingPrincipal));

  for (let r = 4; r <= takvim.rowCount; r++) {
    const row = takvim.getRow(r);
    const ayText = asText(cellVal(row.getCell(1)));
    const yil = Math.round(asNumber(cellVal(row.getCell(2))));
    if (!ayText || !yil) continue;
    if (ayText.toLocaleUpperCase('tr-TR').startsWith('TOPLAM')) continue;
    const abbr = ayText.split(' ')[0] ?? '';
    const month = TR_MONTH_ABBR[abbr];
    if (!month) {
      warnings.push(`Kredi Takvimi satır ${r}: ay çözülemedi ("${ayText}") — atlandı`);
      continue;
    }
    const period = `${yil}-${pad2(month)}`;

    for (let li = 0; li < LOAN_CODES.length; li++) {
      const code = LOAN_CODES[li];
      const startCol = LOAN_SCHEDULE_START_COL[li];
      if (!code || startCol === undefined) continue;
      const loan = parsedLoans.find((l) => l.code === code);
      if (!loan) continue;
      const taksit = asNumber(cellVal(row.getCell(startCol)));
      const faizBsmv = asNumber(cellVal(row.getCell(startCol + 1)));
      // I34 (tur 14 P0) kök neden düzeltmesi: anapara üçüncü hücreden BAĞIMSIZ okunmuyor artık — taksit
      // ve faiz+BSMV önce 4 haneye yuvarlanır (bu iki hücre kaynak veri), anapara bu iki YUVARLANMIŞ
      // Decimal'in FARKI olarak TÜRETİLİR. Böylece installment = interest + principal özdeşliği satır
      // bazında her zaman TAM sağlanır (kaynak Excel'in kendi üç hücresi arasındaki kuruş düzeyi yuvarlama
      // sapmaları veritabanına hiç taşınmaz). remainingAfter zinciri de aynı ROUNDED principal ile, önceki
      // adımın ROUNDED (ham/unrounded değil) bakiyesinden hesaplanır — her adım zaten ≤4 haneli iki Decimal'in
      // farkı olduğundan ek yuvarlama gerekmez ve zincir kümülatif sapma biriktirmez (I34 b/c/d birlikte sağlanır).
      let installmentD = new Decimal(money4(taksit));
      const interestD = new Decimal(money4(faizBsmv));
      let principalD = installmentD.minus(interestD);
      const prevBalance = runningBalance.get(code) ?? new Decimal(0);
      let remainingAfterD = prevBalance.minus(principalD);
      if (taksit <= 0) {
        runningBalance.set(code, remainingAfterD);
        continue; // bu ay bu kredide ödeme yok (henüz başlamadı / bitti)
      }

      const seq = installments.filter((x) => x.loanCode === code).length + 1;
      // Son taksit (I34 c/d): loans.remainingPrincipal ayrı bir Excel hücresinden ("Krediler" sayfası)
      // geldiğinden, bu bağımsız hücre ile 21 satırlık taksit programının (installment−interest) toplamı
      // arasında ~0,0001-0,0002 TL'lik bir kaynak-veri yuvarlama sapması kalabilir. Standart amortisman
      // pratiğinde olduğu gibi bu kuruş-altı fark SON taksitte kapatılır: son satırın anaparası tam
      // `prevBalance`'a eşitlenir (remaining_after kesin sıfıra kapanır, I34-d) ve taksit tutarı da
      // installment=interest+principal özdeşliğini korumak için buna göre yeniden hesaplanır (I34-a);
      // bu da Σprincipal'i otomatik olarak remainingPrincipal'e eşitler (I34-c, telescoping toplam).
      if (seq === loan.remainingInstallments) {
        principalD = prevBalance;
        installmentD = interestD.plus(principalD);
        remainingAfterD = new Decimal(0);
      }
      runningBalance.set(code, remainingAfterD);

      const dueDate = makeDueDate(yil, month, loan.paymentDay);
      installments.push({
        loanCode: code,
        seq,
        dueDate,
        period,
        installment: money4(installmentD),
        interest: money4(interestD),
        principal: money4(principalD),
        remainingAfter: money4(remainingAfterD),
      });
    }
  }

  /* ---------------- Varsayımlar: sabit giderler ---------------- */
  const parsedFixedExpenses: ParsedFixedExpense[] = [];
  FIXED_EXPENSE_ROWS.forEach((def, i) => {
    const row = varsayimlar.getRow(def.row);
    const name = asText(cellVal(row.getCell(1)));
    const amount = asNumber(cellVal(row.getCell(2)));
    if (!name) {
      warnings.push(`Varsayımlar satır ${def.row}: sabit gider adı boş — atlandı`);
      return;
    }
    parsedFixedExpenses.push({
      code: def.code,
      name,
      category: def.category,
      monthlyAmount: money4(amount),
      includesVat: true,
      accountCode: `770.${pad2(i + 1)}`,
      sortOrder: (i + 1) * 10,
    });
  });

  /* ---------------- Varsayımlar: genel anahtar/değer ---------------- */
  const readAssumption = (row: number, key: string, label: string, pct: boolean): ParsedAssumption => {
    const r = varsayimlar.getRow(row);
    const raw = asNumber(cellVal(r.getCell(2)));
    const description = asText(cellVal(r.getCell(5)));
    return { key, value: pct ? pctFromFraction(raw) : money4(raw), label, description };
  };
  const assumptions: ParsedAssumption[] = [
    readAssumption(4, 'opening_cash', 'Dönem başı nakit (1 Eyl 2026)', false),
    readAssumption(5, 'weighted_margin_pct', 'Ağırlıklı brüt (katkı) marjı', true),
    readAssumption(6, 'net_vat_pct', 'Net KDV ödemesi (ciro %)', true),
    readAssumption(7, 'corporate_tax_rate', 'Kurumlar vergisi oranı', true),
    readAssumption(8, 'cash_buffer', 'Aylık nakit tampon hedefi (TL)', false),
    readAssumption(9, 'scenario_multiplier', 'Ciro senaryo çarpanı', false),
    readAssumption(10, 'monthly_growth_pct', 'Aylık ciro büyümesi %', true),
    readAssumption(11, 'fixed_cost_increase_pct', 'Sabit gider yıllık artış %', true),
  ];

  /* ---------------- Varsayımlar: kanal tablosu ---------------- */
  const channels: ParsedChannelAssumption[] = [];
  for (const def of CHANNEL_ROWS) {
    const row = varsayimlar.getRow(def.row);
    const monthlyRevenue = asNumber(cellVal(row.getCell(2)));
    const marginFraction = asNumber(cellVal(row.getCell(3)));
    const lagMonths = asNumber(cellVal(row.getCell(4)));
    const source = asText(cellVal(row.getCell(5)));
    channels.push({
      channelCode: def.code,
      monthlyRevenue: money4(monthlyRevenue),
      contributionMarginPct: pctFromFraction(marginFraction),
      collectionLagMonths: Math.round(lagMonths),
      source,
    });
  }

  return { loans: parsedLoans, installments, fixedExpenses: parsedFixedExpenses, assumptions, channels, warnings };
}

export type ImportNakitAkisiResult = {
  loans: number;
  installments: number;
  fixedExpenses: number;
  assumptions: number;
  channelAssumptions: number;
};

/** Banka adından bank_accounts eşlemesi (Vakıfbank TL / QNB TL) */
async function resolveBankAccountId(db: DbOrTx, bankName: string): Promise<string | null> {
  const like = bankName.toLocaleUpperCase('tr-TR').includes('QNB') ? 'QNB' : 'Vakıfbank';
  const rows = await db.select({ id: bankAccounts.id, bankName: bankAccounts.bankName, currency: bankAccounts.currency }).from(bankAccounts);
  const match = rows.find((r) => r.bankName.includes(like) && r.currency === 'TRY');
  return match?.id ?? null;
}

export async function importNakitAkisi(db: DbOrTx, parsed: ParsedNakitAkisi): Promise<ImportNakitAkisiResult> {
  const loanIdByCode = new Map<LoanCode, string>();

  for (let i = 0; i < parsed.loans.length; i++) {
    const l = parsed.loans[i];
    if (!l) continue;
    const bankAccountId = await resolveBankAccountId(db, l.bankName);
    const accountCode = `300.${pad2(i + 1)}`;
    await db
      .insert(accounts)
      .values({ code: accountCode, name: `Banka Kredisi — ${l.productName}`, type: 'liability', parentCode: '300', level: 2 })
      .onConflictDoNothing({ target: accounts.code });

    await db
      .insert(loans)
      .values({
        code: l.code,
        bankName: l.bankName,
        productName: l.productName,
        reference: l.reference,
        principal: l.principal,
        currency: l.currency,
        openedAt: l.openedAt.toISOString().slice(0, 10),
        termMonths: l.termMonths,
        monthlyRatePct: l.monthlyRatePct,
        rateKind: l.rateKind,
        monthlyInstallment: l.monthlyInstallment,
        paymentDay: l.paymentDay,
        firstRemainingDue: l.firstRemainingDue ? l.firstRemainingDue.toISOString().slice(0, 10) : null,
        lastDue: l.lastDue ? l.lastDue.toISOString().slice(0, 10) : null,
        remainingPrincipal: l.remainingPrincipal,
        remainingInstallments: l.remainingInstallments,
        bankAccountId,
        accountCode,
        interestAccountCode: '780',
      })
      .onConflictDoUpdate({
        target: loans.code,
        set: {
          remainingPrincipal: l.remainingPrincipal,
          remainingInstallments: l.remainingInstallments,
          bankAccountId,
          accountCode,
        },
      });
    const [row] = await db.select({ id: loans.id }).from(loans).where(eq(loans.code, l.code)).limit(1);
    if (row) loanIdByCode.set(l.code, row.id);
  }

  // "Bugün" İstanbul iş günü (core `businessDate` ile aynı takvim). Tarih-saat karşılaştırması
  // (`dueDate < new Date()`) vadesi BUGÜN olan taksidi (UTC gece yarısı < şu an) daha ödeme günü
  // geçmeden `overdue` yapıyordu; vade yalnızca gün olarak geçmişse gecikmiştir.
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let installmentCount = 0;
  for (const inst of parsed.installments) {
    const loanId = loanIdByCode.get(inst.loanCode);
    if (!loanId) continue;
    const status = inst.dueDate.toISOString().slice(0, 10) < todayStr ? 'overdue' : 'scheduled';
    await db
      .insert(loanInstallments)
      .values({
        loanId,
        seq: inst.seq,
        dueDate: inst.dueDate.toISOString().slice(0, 10),
        period: inst.period,
        installment: inst.installment,
        interest: inst.interest,
        principal: inst.principal,
        remainingAfter: inst.remainingAfter,
        status,
      })
      .onConflictDoUpdate({
        target: [loanInstallments.loanId, loanInstallments.seq],
        set: { installment: inst.installment, interest: inst.interest, principal: inst.principal, remainingAfter: inst.remainingAfter, status },
      });
    installmentCount++;
  }

  for (const fe of parsed.fixedExpenses) {
    await db
      .insert(accounts)
      .values({ code: fe.accountCode, name: fe.name, type: 'expense', parentCode: '770', level: 2 })
      .onConflictDoNothing({ target: accounts.code });
    await db
      .insert(fixedExpenses)
      .values({
        code: fe.code,
        name: fe.name,
        category: fe.category,
        monthlyAmount: fe.monthlyAmount,
        includesVat: fe.includesVat,
        accountCode: fe.accountCode,
        sortOrder: fe.sortOrder,
      })
      .onConflictDoUpdate({
        target: fixedExpenses.code,
        set: { name: fe.name, category: fe.category, monthlyAmount: fe.monthlyAmount, includesVat: fe.includesVat, accountCode: fe.accountCode, sortOrder: fe.sortOrder },
      });
  }

  for (const a of parsed.assumptions) {
    await db
      .insert(cashflowAssumptions)
      .values({ key: a.key, value: a.value, label: a.label, description: a.description })
      .onConflictDoUpdate({ target: cashflowAssumptions.key, set: { value: a.value, label: a.label, description: a.description } });
  }

  let channelCount = 0;
  for (const c of parsed.channels) {
    const [channel] = await db.select({ id: salesChannels.id }).from(salesChannels).where(eq(salesChannels.code, c.channelCode)).limit(1);
    if (!channel) continue; // seed/masterdata.ts kanalları önce oluşturmalı
    await db
      .insert(channelAssumptions)
      .values({
        channelId: channel.id,
        monthlyRevenue: c.monthlyRevenue,
        contributionMarginPct: c.contributionMarginPct,
        collectionLagMonths: c.collectionLagMonths,
        source: c.source,
      })
      .onConflictDoUpdate({
        target: channelAssumptions.channelId,
        set: { monthlyRevenue: c.monthlyRevenue, contributionMarginPct: c.contributionMarginPct, collectionLagMonths: c.collectionLagMonths, source: c.source },
      });
    channelCount++;
  }

  return {
    loans: loanIdByCode.size,
    installments: installmentCount,
    fixedExpenses: parsed.fixedExpenses.length,
    assumptions: parsed.assumptions.length,
    channelAssumptions: channelCount,
  };
}

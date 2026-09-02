import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { accounts, journals, taxes, fiscalPeriods, bankAccounts, type accountTypeEnum } from '../schema/index.js';
import { log, type SeedSummary } from './_helpers.js';

type AccountType = (typeof accountTypeEnum.enumValues)[number];
type AccountDef = { code: string; name: string; type: AccountType; parentCode?: string; ifrsCode?: string; ifrsName?: string; currency?: string };

/**
 * Tek Düzen Hesap Planı (VUK) — kullanılan alt küme + makul üst hesaplar.
 * Kodlar `packages/core/src/accounting/mapping.ts` ACCOUNT_CATALOG ile birebir eşleşir (statik veri; core servisi çağrılmaz).
 */
const ACCOUNTS: AccountDef[] = [
  { code: '100', name: 'Kasa', type: 'asset' },
  { code: '102', name: 'Bankalar', type: 'asset' },
  { code: '102.01', name: 'Vakıfbank Tire Şb. TL', type: 'asset', parentCode: '102', currency: 'TRY' },
  { code: '102.02', name: 'QNB Ödemiş Şb. TL', type: 'asset', parentCode: '102', currency: 'TRY' },
  { code: '102.03', name: 'Vakıfbank Tire Şb. EUR', type: 'asset', parentCode: '102', currency: 'EUR' },
  { code: '120', name: 'Alıcılar', type: 'asset', ifrsCode: '120', ifrsName: 'Ticari Alacaklar' },
  { code: '150', name: 'İlk Madde ve Malzeme', type: 'asset', ifrsCode: '150', ifrsName: 'Stoklar — Hammadde' },
  { code: '151', name: 'Yarı Mamuller — Üretim', type: 'asset', ifrsCode: '151', ifrsName: 'Stoklar — Yarı Mamul (WIP)' },
  { code: '152', name: 'Mamuller', type: 'asset', ifrsCode: '152', ifrsName: 'Stoklar — Mamul' },
  { code: '153', name: 'Ticari Mallar', type: 'asset', ifrsCode: '153', ifrsName: 'Stoklar — Ticari Mal' },
  { code: '190', name: 'Devreden KDV', type: 'asset' },
  { code: '191', name: 'İndirilecek KDV', type: 'asset' },
  { code: '253', name: 'Tesis, Makine ve Cihazlar', type: 'asset' },
  { code: '255', name: 'Demirbaşlar', type: 'asset' },
  { code: '300', name: 'Banka Kredileri', type: 'liability' },
  { code: '300.01', name: 'Banka Kredisi — Vakıfbank Tam Çıpa 1,5M', type: 'liability', parentCode: '300' },
  { code: '300.02', name: 'Banka Kredisi — Vakıfbank Kadın İstihdamı 1,5M', type: 'liability', parentCode: '300' },
  { code: '300.03', name: 'Banka Kredisi — QNB 1,5M', type: 'liability', parentCode: '300' },
  { code: '300.04', name: 'Banka Kredisi — Vakıfbank Tam Esnaf 500k', type: 'liability', parentCode: '300' },
  { code: '300.05', name: 'Banka Kredisi — Vakıfbank Tam Esnaf 400k', type: 'liability', parentCode: '300' },
  { code: '300.06', name: 'Banka Kredisi — Vakıfbank Trendyol 385k', type: 'liability', parentCode: '300' },
  { code: '300.07', name: 'Banka Kredisi — Vakıfbank SKY KOBİ 100k', type: 'liability', parentCode: '300' },
  { code: '320', name: 'Satıcılar', type: 'liability', ifrsCode: '320', ifrsName: 'Ticari Borçlar' },
  { code: '320.999', name: 'Faturası Gelmemiş Alımlar', type: 'liability', parentCode: '320' },
  { code: '360', name: 'Ödenecek Vergi ve Fonlar', type: 'liability' },
  { code: '391', name: 'Hesaplanan KDV', type: 'liability' },
  { code: '500', name: 'Sermaye', type: 'equity' },
  { code: '590', name: 'Dönem Net Kârı', type: 'equity' },
  { code: '600', name: 'Yurtiçi Satışlar', type: 'income' },
  { code: '601', name: 'Yurtdışı Satışlar', type: 'income' },
  { code: '610', name: 'Satıştan İadeler (-)', type: 'income' },
  { code: '621', name: 'Satılan Mamuller Maliyeti (-)', type: 'cogs' },
  { code: '646', name: 'Kambiyo Kârları', type: 'income' },
  { code: '656', name: 'Kambiyo Zararları (-)', type: 'expense' },
  { code: '659', name: 'Diğer Olağan Gider ve Zararlar (-)', type: 'expense' },
  { code: '679', name: 'Diğer Olağandışı Gelir ve Kârlar', type: 'income' },
  { code: '710', name: 'Direkt İlk Madde ve Malzeme Giderleri', type: 'expense' },
  { code: '720', name: 'Direkt İşçilik Giderleri', type: 'expense' },
  { code: '730', name: 'Genel Üretim Giderleri', type: 'expense' },
  { code: '731', name: 'Genel Üretim Giderleri Yansıtma', type: 'expense' },
  { code: '760', name: 'Pazarlama Satış ve Dağıtım Giderleri', type: 'expense' },
  { code: '770', name: 'Genel Yönetim Giderleri', type: 'expense' },
  { code: '780', name: 'Finansman Giderleri', type: 'expense' },
];
// Not: 770.xx sabit gider alt hesapları seed/finance.ts içinde (importNakitAkisi) gerçek Excel adlarıyla oluşturulur.

const JOURNALS: Array<{ code: string; name: string; kind: (typeof journals.$inferInsert)['kind']; defaultAccountCode?: string }> = [
  { code: 'GEN', name: 'Genel Yevmiye', kind: 'general' },
  { code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales', defaultAccountCode: '600' },
  { code: 'ALS', name: 'Alış Yevmiyesi', kind: 'purchase', defaultAccountCode: '320' },
  { code: 'BNK', name: 'Banka Yevmiyesi', kind: 'bank', defaultAccountCode: '102' },
  { code: 'KAS', name: 'Kasa Yevmiyesi', kind: 'cash', defaultAccountCode: '100' },
  { code: 'STK', name: 'Stok Yevmiyesi', kind: 'stock' },
  { code: 'URT', name: 'Üretim Yevmiyesi', kind: 'production' },
  { code: 'KUR', name: 'Kur Farkı Yevmiyesi', kind: 'fx' },
];

const TAXES: Array<{ code: string; name: string; ratePct: string; scope: string; accountCode: string }> = [
  { code: 'KDV1', name: 'KDV %1 (Gıda satışı)', ratePct: '1', scope: 'sale', accountCode: '391' },
  { code: 'KDV10', name: 'KDV %10', ratePct: '10', scope: 'both', accountCode: '391' },
  { code: 'KDV20', name: 'KDV %20 (Alış / hizmet / promosyon)', ratePct: '20', scope: 'purchase', accountCode: '191' },
  { code: 'KDV0', name: 'KDV %0 (İhracat)', ratePct: '0', scope: 'sale', accountCode: '391' },
];

const TR_MONTHS_START = { year: 2026, month: 1 };
const TR_MONTHS_END = { year: 2029, month: 12 };
/** 2026-08 öncesi kapalı dönem (canlıya geçiş 20.07.2026, sistem kaydı Eylül 2026'dan başlıyor) */
const CLOSED_BEFORE = { year: 2026, month: 8 };

function* monthRange(from: { year: number; month: number }, to: { year: number; month: number }) {
  let y = from.year;
  let m = from.month;
  while (y < to.year || (y === to.year && m <= to.month)) {
    yield { year: y, month: m };
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export async function seedAccounting(db: DbOrTx, summary: SeedSummary): Promise<void> {
  log('accounting', 'hesap planı...');
  for (const a of ACCOUNTS) {
    await db
      .insert(accounts)
      .values({
        code: a.code,
        name: a.name,
        type: a.type,
        parentCode: a.parentCode ?? null,
        level: a.code.includes('.') ? 2 : 1,
        ifrsCode: a.ifrsCode ?? null,
        ifrsName: a.ifrsName ?? null,
        currency: a.currency ?? 'TRY',
      })
      .onConflictDoUpdate({ target: accounts.code, set: { name: a.name, type: a.type, parentCode: a.parentCode ?? null, ifrsCode: a.ifrsCode ?? null, ifrsName: a.ifrsName ?? null } });
  }
  summary.add('accounts', ACCOUNTS.length);

  log('accounting', 'yevmiye defterleri...');
  for (const j of JOURNALS) {
    await db
      .insert(journals)
      .values({ code: j.code, name: j.name, kind: j.kind, defaultAccountCode: j.defaultAccountCode ?? null })
      .onConflictDoUpdate({ target: journals.code, set: { name: j.name, kind: j.kind, defaultAccountCode: j.defaultAccountCode ?? null } });
  }
  summary.add('journals', JOURNALS.length);

  log('accounting', 'vergiler...');
  for (const t of TAXES) {
    await db
      .insert(taxes)
      .values({ code: t.code, name: t.name, ratePct: t.ratePct, scope: t.scope, accountCode: t.accountCode })
      .onConflictDoUpdate({ target: taxes.code, set: { name: t.name, ratePct: t.ratePct, scope: t.scope, accountCode: t.accountCode } });
  }
  summary.add('taxes', TAXES.length);

  log('accounting', 'mali dönemler (2026-01 → 2029-12)...');
  let periodCount = 0;
  for (const { year, month } of monthRange(TR_MONTHS_START, TR_MONTHS_END)) {
    const code = `${year}-${pad2(month)}`;
    const startDate = `${code}-01`;
    const endDate = `${code}-${pad2(lastDayOfMonth(year, month))}`;
    const isClosed = year < CLOSED_BEFORE.year || (year === CLOSED_BEFORE.year && month < CLOSED_BEFORE.month);
    await db
      .insert(fiscalPeriods)
      .values({ code, year, month, startDate, endDate, isClosed })
      .onConflictDoUpdate({ target: fiscalPeriods.code, set: { isClosed } });
    periodCount++;
  }
  summary.add('fiscal_periods', periodCount);

  log('accounting', 'banka hesapları...');
  const BANK_ACCOUNTS: Array<{ code: string; bankName: string; branch: string; currency: string; accountCode: string }> = [
    { code: 'VKF-TIRE-TL', bankName: 'Vakıfbank', branch: 'Tire Şubesi', currency: 'TRY', accountCode: '102.01' },
    { code: 'QNB-ODEMIS-TL', bankName: 'QNB', branch: 'Ödemiş Şubesi', currency: 'TRY', accountCode: '102.02' },
    { code: 'VKF-TIRE-EUR', bankName: 'Vakıfbank', branch: 'Tire Şubesi', currency: 'EUR', accountCode: '102.03' },
  ];
  for (const b of BANK_ACCOUNTS) {
    await db
      .insert(bankAccounts)
      .values({ code: b.code, bankName: b.bankName, branch: b.branch, currency: b.currency, accountCode: b.accountCode, connectorKind: 'manual' })
      .onConflictDoUpdate({ target: bankAccounts.code, set: { bankName: b.bankName, branch: b.branch, currency: b.currency, accountCode: b.accountCode } });
  }
  summary.add('bank_accounts', BANK_ACCOUNTS.length);

  // Erişimi kolaylaştırmak için: tüm hesapların isPostable/level tutarlılığı (basit doğrulama)
  const [check] = await db.select({ code: accounts.code }).from(accounts).where(eq(accounts.code, '600')).limit(1);
  if (!check) throw new Error('Hesap planı seed sonrası doğrulanamadı (600 bulunamadı)');
}

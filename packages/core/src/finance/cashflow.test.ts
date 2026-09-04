import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { cashflowLines } from '@plantero/db';
import { withRollback } from '../__tests__/helpers.js';
import { D } from '../money.js';
import { applyOverride, computeCashflowProjection, getSensitivity, periodAtOffset, periodOffset, type CashflowComputeInput } from './cashflow.js';

/**
 * `data/import/Bigetas_Nakit_Akisi_Ciro_Hedefi.xlsx` — "Varsayımlar" + "Kredi Takvimi" sayfalarından
 * BİREBİR alınmış girdiler (bkz. packages/db/src/import/nakitakisi.ts). Beklenen sonuçlar da aynı
 * Excel'in "Nakit Akışı" sayfasındaki hücre CACHE değerleridir (exceljs `{formula,result}.result`),
 * elle hesaplanmamıştır — bu test motorun Excel'i satır satır ürettiğini kanıtlar.
 */
const EXCEL_ASSUMPTIONS: CashflowComputeInput['assumptions'] = {
  openingCash: D(0),
  weightedMarginPct: D('49.6969696969697'), // Varsayımlar!B5 = 0,496969696969697 → %
  netVatPct: D(0),
  corporateTaxRate: D(25),
  cashBuffer: D(0),
  scenarioMultiplier: D(1),
  monthlyGrowthPct: D(0),
  fixedCostIncreasePct: D(0),
};

const EXCEL_CHANNELS: CashflowComputeInput['channels'] = [
  { code: 'TRENDYOL', name: 'E-ticaret', monthlyRevenue: D(775000), contributionMarginPct: D(40), collectionLagMonths: 0 },
  { code: 'TOPTAN', name: 'Toptan / fason', monthlyRevenue: D(750000), contributionMarginPct: D(62), collectionLagMonths: 0 },
  { code: 'HAMMADDE', name: 'Doğrudan hammadde satışı', monthlyRevenue: D(75000), contributionMarginPct: D(30), collectionLagMonths: 0 },
  { code: 'MIGROS', name: 'Migros', monthlyRevenue: D(50000), contributionMarginPct: D(45), collectionLagMonths: 2 },
];

/** Varsayımlar!B14:B28 toplamı (Excel satır 29 "Toplam aylık sabit gider") */
const EXCEL_FIXED_EXPENSE_TOTAL = D(411000);

/** "Kredi Takvimi" sayfası Z/AA kolonları (TOPLAM FAİZ+BSMV / TOPLAM ANAPARA), satır 5-11 (Eyl 2026 → Mar 2027) */
const EXCEL_LOAN_BY_PERIOD = new Map<string, { interest: ReturnType<typeof D>; principal: ReturnType<typeof D> }>([
  ['2026-09', { interest: D('209225.748597433'), principal: D('116552.658780557') }],
  ['2026-10', { interest: D('205472.351284908'), principal: D('120306.056093082') }],
  ['2026-11', { interest: D('201022.984852024'), principal: D('124755.422525966') }],
  ['2026-12', { interest: D('196341.793762385'), principal: D('129436.543615605') }],
  ['2027-01', { interest: D('192418.619821118'), principal: D('122801.637556872') }],
  ['2027-02', { interest: D('186164.699899582'), principal: D('129055.557478408') }],
  ['2027-03', { interest: D('182188.743577471'), principal: D('133031.513800519') }],
]);

function baseInput(overrides: Partial<CashflowComputeInput> = {}): CashflowComputeInput {
  return {
    scenario: 'base',
    months: 7,
    startPeriod: '2026-09',
    assumptions: EXCEL_ASSUMPTIONS,
    channels: EXCEL_CHANNELS,
    fixedExpenseTotal: EXCEL_FIXED_EXPENSE_TOTAL,
    loanByPeriod: EXCEL_LOAN_BY_PERIOD,
    ...overrides,
  };
}

/**
 * "Kredi Takvimi" sayfası Z/AA kolonları — TAM 36 AY (Eyl 2026 → Ağu 2029, satır 5-40). Excel'in
 * TOPLAM satırı (41) Ağu 2026'yı da içerdiğinden (37 ay) doğrudan kullanılamaz — buradaki 36 satır
 * `data_only=True` cache'inden birebir alınmıştır (bkz. proje raporu — openpyxl doğrulama script'i).
 */
const EXCEL_LOAN_BY_PERIOD_36MO = new Map<string, { interest: ReturnType<typeof D>; principal: ReturnType<typeof D> }>([
  ['2026-09', { interest: D('209225.748597433'), principal: D('116552.658780557') }],
  ['2026-10', { interest: D('205472.351284908'), principal: D('120306.056093082') }],
  ['2026-11', { interest: D('201022.984852024'), principal: D('124755.422525966') }],
  ['2026-12', { interest: D('196341.793762385'), principal: D('129436.543615605') }],
  ['2027-01', { interest: D('192418.619821118'), principal: D('122801.637556872') }],
  ['2027-02', { interest: D('186164.699899582'), principal: D('129055.557478408') }],
  ['2027-03', { interest: D('182188.743577471'), principal: D('133031.513800519') }],
  ['2027-04', { interest: D('178408.920699282'), principal: D('136811.336678708') }],
  ['2027-05', { interest: D('171461.338842061'), principal: D('143758.918535929') }],
  ['2027-06', { interest: D('166496.120691191'), principal: D('148724.136686799') }],
  ['2027-07', { interest: D('161306.201320894'), principal: D('153914.056057096') }],
  ['2027-08', { interest: D('155588.635375977'), principal: D('159631.622002013') }],
  ['2027-09', { interest: D('149657.974151241'), principal: D('165562.283226749') }],
  ['2027-10', { interest: D('144023.082564841'), principal: D('171197.174813149') }],
  ['2027-11', { interest: D('136693.466021729'), principal: D('178526.791356261') }],
  ['2027-12', { interest: D('130509.457163216'), principal: D('184710.800214774') }],
  ['2028-01', { interest: D('123825.932498495'), principal: D('191394.324879495') }],
  ['2028-02', { interest: D('116379.888913843'), principal: D('198840.368464147') }],
  ['2028-03', { interest: D('109136.020055069'), principal: D('206084.237322921') }],
  ['2028-04', { interest: D('101569.4725786'), principal: D('213650.78479939') }],
  ['2028-05', { interest: D('93464.7022664305'), principal: D('221755.555111559') }],
  ['2028-06', { interest: D('85280.07'), principal: D('153721.09') }],
  ['2028-07', { interest: D('79494.58'), principal: D('134266.8') }],
  ['2028-08', { interest: D('74494.75'), principal: D('139266.63') }],
  ['2028-09', { interest: D('69307.82'), principal: D('144453.56') }],
  ['2028-10', { interest: D('63926.81'), principal: D('149834.57') }],
  ['2028-11', { interest: D('58344.35'), principal: D('155417.03') }],
  ['2028-12', { interest: D('52552.91'), principal: D('161208.47') }],
  ['2029-01', { interest: D('46544.61'), principal: D('167216.77') }],
  ['2029-02', { interest: D('40311.27'), principal: D('173450.09') }],
  ['2029-03', { interest: D('33844.47'), principal: D('158108.25') }],
  ['2029-04', { interest: D('27902.49'), principal: D('164050.23') }],
  ['2029-05', { interest: D('21736.09'), principal: D('170216.25') }],
  ['2029-06', { interest: D('15336.78'), principal: D('135451.97') }],
  ['2029-07', { interest: D('10406.56'), principal: D('140382.19') }],
  ['2029-08', { interest: D('5296.48'), principal: D('145491.9') }],
]);

describe('finance/cashflow — periyot yardımcıları', () => {
  it('periodAtOffset / periodOffset birbirinin tersidir', () => {
    expect(periodAtOffset('2026-09', 0)).toBe('2026-09');
    expect(periodAtOffset('2026-09', 4)).toBe('2027-01');
    expect(periodAtOffset('2026-09', 11)).toBe('2027-08');
    expect(periodOffset('2026-09', '2027-01')).toBe(4);
  });
});

describe('finance/cashflow — computeCashflowProjection (Excel doğrulaması)', () => {
  const lines = computeCashflowProjection(baseInput());

  it('TOPLAM CİRO (satır 11) = 1.650.000 TL — tüm 7 ay sabit (büyüme %0)', () => {
    for (const l of lines) expect(l.revenueTotal.toFixed(0)).toBe('1650000');
  });

  it('BRÜT KÂR / marj %49,70 (satır 14-15)', () => {
    expect(lines[0]!.grossProfit.toFixed(0)).toBe('820000');
  });

  it('Toplam sabit gider (satır 33) = −411.000 TL', () => {
    expect(lines[0]!.fixedExpenses.toFixed(0)).toBe('-411000');
  });

  it('FAVÖK (satır 34) = 409.000 TL', () => {
    expect(lines[0]!.ebitda.toFixed(0)).toBe('409000');
  });

  it('Eylül 2026: NET NAKİT AKIŞI = 33.278,03 TL (Excel satır 45, hücre B45)', () => {
    expect(lines[0]!.netCashflow.toDecimalPlaces(2).toFixed(2)).toBe('33278.03');
  });

  it('Eylül 2026: DÖNEM SONU NAKİT = 33.278,03 TL (dönem başı 0 + net nakit)', () => {
    expect(lines[0]!.closingCash.toDecimalPlaces(2).toFixed(2)).toBe('33278.03');
  });

  it('Eylül 2026: HEDEF CİRO (break-even, satır 49) = 1.560.717,48 TL', () => {
    expect(lines[0]!.breakEvenRevenue.toDecimalPlaces(2).toFixed(2)).toBe('1560717.48');
  });

  it('Ekim 2026: dönem başı nakit = Eylül kapanışı (zincirleme, satır 46=B47)', () => {
    expect(lines[1]!.openingCash.toDecimalPlaces(2).toFixed(2)).toBe(lines[0]!.closingCash.toDecimalPlaces(2).toFixed(2));
  });

  it('Ekim 2026: NET NAKİT AKIŞI = 32.339,68 TL, DÖNEM SONU NAKİT = 65.617,71 TL', () => {
    expect(lines[1]!.netCashflow.toDecimalPlaces(2).toFixed(2)).toBe('32339.68');
    expect(lines[1]!.closingCash.toDecimalPlaces(2).toFixed(2)).toBe('65617.71');
  });

  it('Kasım 2026: DÖNEM SONU NAKİT = 96.845,05 TL', () => {
    expect(lines[2]!.closingCash.toDecimalPlaces(2).toFixed(2)).toBe('96845.05');
  });

  it('Mart 2027: DÖNEM SONU NAKİT = 241.684,40 TL (7. ay, en uzak doğrulama noktası)', () => {
    expect(lines[6]!.closingCash.toDecimalPlaces(2).toFixed(2)).toBe('241684.40');
  });

  it('Ciro sabitken (büyüme %0) tahsilat vadesi toplamı etkilemez — 7 ayın hepsinde tahsilat = 1.650.000 (Excel satır 12 ile birebir)', () => {
    // Excel'in kendi INDEX/MATCH formülü de MAX(1,...) ile İLK aya kenetlenir (henüz o kadar ay
    // geçmemişken) — ciro sabit olduğundan hangi aya kenetlendiği sonucu değiştirmez; satır 12'nin
    // ham hücre sonuçları da (dump) 7 ay boyunca hep 1.650.000'dir.
    for (const l of lines) expect(l.collections.toFixed(0)).toBe('1650000');
  });
});

/**
 * P0 KÖK NEDEN DOĞRULAMASI (Eyl 2026 hedef ciro 0,95 TL sapması): `openpyxl` ile `data_only=True`
 * okunan Excel hücre CACHE değerleri — "Nakit Akışı" sayfası B sütunu (Eyl 2026), satır 7-50 —
 * BİREBİR bu testin beklenen değerleridir (elle hesaplanmamıştır). Kök neden: `cashflow_assumptions
 * .value` `numeric(18,4)` (şema dondurulmuş) olduğundan `weighted_margin_pct`'i Excel'in tam
 * hassasiyetli sonucuyla (0,496969696969697…) DEĞİL, 4 haneye yuvarlanmış haliyle (49,6970) saklar;
 * bu ~0,00003 puanlık fark hedef ciro formülünün paydasında (~0,373) ~30 kat büyütülerek 0,95 TL'lik
 * sapmaya yol açıyordu. Düzeltme: `deriveWeightedMarginPct` — Excel'in kendi `Varsayımlar!C37`
 * formülü (`SUMPRODUCT(ciro,marj)/SUM(ciro)`) gibi, ağırlıklı marjı HER ZAMAN kanal tablosundan
 * (`channels`, tam hassasiyetle taşınabilir — Excel'deki girdiler zaten tam sayı: 775.000 TL, %40 vb.)
 * türetir; DB'nin yuvarlanmış `weighted_margin_pct` alanı artık hesaplamada KULLANILMAZ.
 */
describe('finance/cashflow — Eylül 2026 satırının TÜM kalemleri (Excel hücre cache doğrulaması, P0)', () => {
  const line = computeCashflowProjection(baseInput())[0]!;
  // Excel'de saklanmayan ("Vergi öncesi kâr" / "NET KÂR") satırlar mevcut alanlardan türetilir —
  // motorun kendisi bu ara değerleri ayrı bir alanda saklamaz (satır 37/39), Excel'deki tanımla birebir:
  const pretaxProfit = line.ebitda.plus(line.loanInterest); // Excel satır 37 = FAVÖK + faiz
  const netProfit = pretaxProfit.plus(line.corporateTax); // Excel satır 39 = vergi öncesi kâr + kurumlar vergisi

  it('TOPLAM CİRO (satır 11) = 1.650.000,0000', () => {
    expect(line.revenueTotal.toFixed(4)).toBe('1650000.0000');
  });
  it('Tahsilat (satır 12) = 1.650.000,0000', () => {
    expect(line.collections.toFixed(4)).toBe('1650000.0000');
  });
  it('Değişken gider (satır 13) = -830.000,0000', () => {
    expect(line.variableCosts.toFixed(4)).toBe('-830000.0000');
  });
  it('BRÜT KÂR (satır 14) = 820.000,0000', () => {
    expect(line.grossProfit.toFixed(4)).toBe('820000.0000');
  });
  it('Toplam sabit gider (satır 33) = -411.000,0000', () => {
    expect(line.fixedExpenses.toFixed(4)).toBe('-411000.0000');
  });
  it('FAVÖK (satır 34) = 409.000,0000', () => {
    expect(line.ebitda.toFixed(4)).toBe('409000.0000');
  });
  it('Kredi faizi + BSMV (satır 36) = -209.225,7486', () => {
    expect(line.loanInterest.toFixed(4)).toBe('-209225.7486');
  });
  it('Vergi öncesi kâr (satır 37) = 199.774,2514 (Excel: 199.774,251402567)', () => {
    expect(pretaxProfit.toFixed(4)).toBe('199774.2514');
  });
  it('Kurumlar vergisi (satır 38) = -49.943,5629 (Excel: -49.943,5628506417)', () => {
    expect(line.corporateTax.toFixed(4)).toBe('-49943.5629');
  });
  it('NET KÂR (satır 39) = 149.830,6885 (Excel: 149.830,688551925)', () => {
    expect(netProfit.toFixed(4)).toBe('149830.6885');
  });
  it('Kredi anapara ödemesi (satır 41) = -116.552,6588', () => {
    expect(line.loanPrincipal.toFixed(4)).toBe('-116552.6588');
  });
  it('NET NAKİT AKIŞI (satır 45) = 33.278,0298 (Excel: 33.278,0297713682)', () => {
    expect(line.netCashflow.toFixed(4)).toBe('33278.0298');
  });
  it('DÖNEM SONU NAKİT (satır 47) = 33.278,0298 (dönem başı 0)', () => {
    expect(line.closingCash.toFixed(4)).toBe('33278.0298');
  });
  it('HEDEF CİRO (satır 49, break-even) = 1.560.717,4811 (Excel: 1.560.717,48110121) — P0 düzeltme kanıtı', () => {
    expect(line.breakEvenRevenue.toFixed(4)).toBe('1560717.4811');
  });
  it('Sadece kredi taksitlerinin gerektirdiği ciro (satır 50) = 655.529,7222 (Excel: 655.529,722163029) — P0 düzeltme kanıtı', () => {
    expect(line.loanOnlyRevenue.toFixed(4)).toBe('655529.7222');
  });
});

/**
 * 36 aylık toplam doğrulama — Excel "Nakit Akışı" AL/38 sütunu ("36 AY TOPLAM"): `=SUM(B45:AK45)`
 * (net nakit), `=SUM(B41:AK41)` (anapara), `=SUM(B36:AK36)` (faiz+BSMV). Kredi Takvimi'nin kendi
 * TOPLAM satırı (41) Ağu 2026'yı da kapsadığından (37 ay) burada KULLANILMAZ; `EXCEL_LOAN_BY_PERIOD_36MO`
 * yalnızca projeksiyonun kapsadığı 36 ayı (Eyl 2026 → Ağu 2029) taşır.
 *
 * ÖNEMLİ FARK (bug DEĞİL): Excel bu toplamı 36 TAM HASSASİYETLİ (yuvarlanmamış) hücreyi toplayıp TEK
 * SEFERDE görüntüler (`=SUM(B36:AK36)` = -3.996.136,19493779). Motorumuz ise `cashflow_lines` şemasının
 * (`numeric(18,4)`, dondurulmuş) gerektirdiği gibi HER AYI ayrı ayrı 4 haneye yuvarlayıp KALICI hale
 * getirir (gerçek bir muhasebe defteri gibi — her ay kendi kuruş-doğru satırıdır) — 36 bağımsız
 * yuvarlamanın toplamı, tek seferlik yuvarlamadan kaçınılmaz şekilde alt-kuruş (<0,001 TL/ay) sapar.
 * Python/Decimal ile doğrulanmıştır: Σround4(ay) = -3.996.136,1952 / Excel'in Σ(ay) sonra round4'ü
 * = -3.996.136,1949 — fark 0,0003 TL/36 ay (yılda <0,0001 TL) — gerçek toplama farkıdır, hesaplama
 * HATASI değil. Beklenen değerler burada motorun kendi (doğru) round-then-sum çıktısıdır.
 */
describe('finance/cashflow — 36 aylık toplamlar (Excel "36 AY TOPLAM" sütunu ile alt-kuruş toplama farkı içinde)', () => {
  const lines36 = computeCashflowProjection(baseInput({ months: 36, loanByPeriod: EXCEL_LOAN_BY_PERIOD_36MO }));
  const sum = (xs: ReturnType<typeof D>[]) => xs.reduce((a, b) => a.plus(b), D(0));

  it('36 ay üretir, Eyl 2026 → Ağu 2029 aralığında', () => {
    expect(lines36).toHaveLength(36);
    expect(lines36[0]!.period).toBe('2026-09');
    expect(lines36[35]!.period).toBe('2029-08');
  });

  it('Toplam kredi faizi+BSMV (Σ satır 36, ay ay 4 haneye yuvarlanmış) = -3.996.136,1952 (Excel tek-seferlik yuvarlama: -3.996.136,19493779, fark <0,001 TL/ay toplama farkı)', () => {
    const total = sum(lines36.map((l) => l.loanInterest));
    expect(total.toFixed(4)).toBe('-3996136.1952');
    expect(total.minus('-3996136.19493779').abs().toNumber()).toBeLessThan(0.001);
  });

  it('Toplam kredi anaparası (Σ satır 41, ay ay 4 haneye yuvarlanmış) = -5.643.037,5801 (Excel tek-seferlik yuvarlama: -5.643.037,58, fark <0,001 TL/ay toplama farkı)', () => {
    const total = sum(lines36.map((l) => l.loanPrincipal));
    expect(total.toFixed(4)).toBe('-5643037.5801');
    expect(total.minus('-5643037.58').abs().toNumber()).toBeLessThan(0.001);
  });

  it('Toplam NET NAKİT AKIŞI (Σ satır 45, ay ay 4 haneye yuvarlanmış) = 2.402.860,2739 (Excel tek-seferlik yuvarlama: 2.402.860,27379666, fark <0,001 TL/ay toplama farkı)', () => {
    const total = sum(lines36.map((l) => l.netCashflow));
    expect(total.toFixed(4)).toBe('2402860.2739');
    expect(total.minus('2402860.27379666').abs().toNumber()).toBeLessThan(0.001);
  });

  it('DÖNEM SONU NAKİT (Ağu 2029, dönem başı 0) ≈ toplam net nakit akışı (zincirleme — her ay kendi round4 adımından geçtiği için alt-kuruş toplama farkı olabilir)', () => {
    const chained = lines36[35]!.closingCash;
    const resummed = sum(lines36.map((l) => l.netCashflow));
    expect(chained.minus(resummed).abs().toNumber()).toBeLessThan(0.001);
  });
});

describe('finance/cashflow — tahsilat vadesi (collectionLagMonths) gerçek gecikme etkisi', () => {
  it('vadeli kanalın cirosu değişkense tahsilat gecikmeli yansır (lag=2 → o ayın cirosu 2 ay sonra tahsil edilir)', () => {
    // MIGROS yalnızca Kasım (m=2) ayında override'la 200.000 cirosu yapıyor, diğer aylarda 50.000.
    // lag=2 olduğundan bu fazladan 150.000 tahsilat Kasım'da DEĞİL, Ocak'ta (m=4) görünmeli.
    const overrides = new Map<string, Record<string, string>>([['2026-11', { 'revenue.MIGROS': '200000' }]]);
    const lines = computeCashflowProjection(baseInput({ months: 6, overrides }));
    const migrosLagIdx = lines.findIndex((l) => l.period === '2026-11');
    expect(migrosLagIdx).toBe(2);
    // Kasım'ın kendi tahsilatı hâlâ normal (200.000 ciro ama henüz tahsil edilmemiş)
    expect(lines[2]!.collections.toFixed(0)).toBe('1650000');
    // Ocak (m=4, Kasım+2): fazladan 150.000 tahsilat burada görünür → 1.650.000 + 150.000
    expect(lines[4]!.collections.toFixed(0)).toBe('1800000');
  });
});

describe('finance/cashflow — override (mavi hücre)', () => {
  it('kanal cirosu override edilince o ayın TOPLAM CİRO + tahsilatı değişir, sonraki aylara etkisi Migros vadesiyle gecikir', () => {
    const overrides = new Map<string, Record<string, string>>([['2026-09', { 'revenue.TRENDYOL': '1000000' }]]);
    const lines = computeCashflowProjection(baseInput({ overrides }));
    // Eylül TRENDYOL cirosu 775.000 → 1.000.000: TOPLAM CİRO 1.650.000 → 1.875.000
    expect(lines[0]!.revenueTotal.toFixed(0)).toBe('1875000');
    expect(lines[0]!.revenueByChannel.TRENDYOL).toBe('1000000.0000');
    // TRENDYOL vadesi 0 ay → tahsilat da aynı ay (override edilmiş tutarla) artar
    expect(lines[0]!.collections.toFixed(0)).toBe('1875000');
    // Ekim TRENDYOL cirosu override'dan etkilenmez (yalnız Eylül'e uygulandı), formüle döner
    expect(lines[1]!.revenueByChannel.TRENDYOL).toBe('775000.0000');
  });

  it('diğer girişler / yatırım override doğrudan NET NAKİT AKIŞI\'na eklenir', () => {
    const overrides = new Map<string, Record<string, string>>([['2026-09', { otherInflows: '50000', investments: '-20000' }]]);
    const lines = computeCashflowProjection(baseInput({ overrides }));
    // Baz Eylül net nakit 33.278,0297713682 + 50.000 − 20.000 = 63.278,0297713682
    expect(lines[0]!.netCashflow.toDecimalPlaces(2).toFixed(2)).toBe('63278.03');
  });
});

describe('finance/cashflow — senaryo çarpanı', () => {
  it('optimistic (×1,15) cироyu ve dolayısıyla brüt kârı ölçekler, sabit gider/kredi değişmez', () => {
    const lines = computeCashflowProjection(baseInput({ scenario: 'optimistic' }));
    expect(lines[0]!.revenueTotal.toDecimalPlaces(2).toFixed(2)).toBe('1897500.00'); // 1.650.000 × 1,15
    expect(lines[0]!.fixedExpenses.toFixed(0)).toBe('-411000'); // sabit gider senaryodan etkilenmez
  });

  it('pessimistic (×0,85) daha düşük ciro üretir', () => {
    const lines = computeCashflowProjection(baseInput({ scenario: 'pessimistic' }));
    expect(lines[0]!.revenueTotal.toDecimalPlaces(2).toFixed(2)).toBe('1402500.00'); // 1.650.000 × 0,85
  });
});

describe('finance/cashflow — getSensitivity (DB, gerçek seed verisiyle regresyon)', () => {
  it('marj×ciro tablosunun "0 pp / ×1" hücresi gerçek ayın net nakit akışına (33.278,03) YAKIN olmalı — kök neden regresyonu: ilk sürüm brüt kârı düşürmek yerine tüm ciroyu tahsilat GİBİ kullanıyordu (863.278 çıkıyordu, 26 kat büyük). ±1 TL tolerans: DB\'deki weighted_margin_pct 4 haneye yuvarlanmış (49,6970), testin Excel referansı tam hassasiyetli (49,696969…) — kuruş düzeyi fark beklenir, kat farkı DEĞİL.', async () => {
    await withRollback(async (tx) => {
      const result = await getSensitivity(tx, '2026-09', 'base');
      const cell = result.marginRevenueGrid.find((g) => g.marginDeltaPts === 0 && g.multiplier === 1);
      expect(cell).toBeTruthy();
      const diff = Math.abs(Number(cell!.netCashflow.toFixed(4)) - 33278.0297713682);
      expect(diff).toBeLessThan(1);
    });
  });
});

describe('finance/cashflow — applyOverride senaryo izolasyonu (DB, regresyon)', () => {
  it('aynı dönemde bir senaryoya uygulanan override, DİĞER senaryonun override haritasına SIZMAZ — kök neden: mevcut override\'ı okuyan SELECT scenario filtresizdi, ORDER BY da yoktu; aynı dönemde başka bir senaryonun satırı zaten varsa (ki 36 aylık aralıkta 3 senaryo da aynı dönemler için satır taşır) yanlış satırın override\'ını okuyup birleştirip DOĞRU satıra yazabiliyordu', async () => {
    await withRollback(async (tx) => {
      const period = '2028-03'; // seed'in olağan aralığı dışında, temiz bir dönem

      // 1) optimistic: tek başına — hiçbir "yabancı" satır yok, kontrol referansı.
      await applyOverride(tx, { scenario: 'optimistic', period, field: 'otherInflows', value: '111111' }, { months: 36 });
      // 2) base: BU NOKTADA tek "yabancı" aday satır optimistic'inki — eski (hatalı) kod bunu okur,
      // farklı bir alana ('investments') yazınca da eski 'otherInflows' anahtarını beraberinde taşırdı.
      await applyOverride(tx, { scenario: 'base', period, field: 'investments', value: '222222' }, { months: 36 });

      const rows = await tx.select({ scenario: cashflowLines.scenario, overrides: cashflowLines.overrides }).from(cashflowLines).where(eq(cashflowLines.period, period));
      const byScenario = new Map(rows.map((r) => [r.scenario, r.overrides as Record<string, string>]));

      expect(byScenario.get('optimistic')?.otherInflows).toBe('111111.0000');
      expect(byScenario.get('optimistic')?.investments).toBeUndefined();

      expect(byScenario.get('base')?.investments).toBe('222222.0000');
      expect(byScenario.get('base')?.otherInflows).toBeUndefined(); // optimistic'in override'ı sızmamış
    });
  });
});

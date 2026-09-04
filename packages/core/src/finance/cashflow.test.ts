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

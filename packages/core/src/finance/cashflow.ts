import { and, eq } from 'drizzle-orm';
import { cashflowAssumptions, channelAssumptions, salesChannels, fixedExpenses, loanInstallments, cashflowLines, type DbOrTx } from '@plantero/db';
import { D, ONE, ZERO, max as maxDecimal, round4, toDb, sum, type Decimal } from '../money.js';
import { businessDate } from '../dates.js';
import { getAccountBalance } from '../accounting/journal.js';

/**
 * 36 aylık nakit akışı projeksiyon motoru — `data/import/Bigetas_Nakit_Akisi_Ciro_Hedefi.xlsx`
 * "Nakit Akışı" sayfasındaki formüllerin BİREBİR (satır satır) TypeScript karşılığı. Hesaplama
 * (`computeCashflowProjection`) saf bir fonksiyondur — DB'ye dokunmaz, `cashflow.test.ts` Excel'in
 * kendi hücre sonuçlarıyla (Eyl 2026 net nakit 33.278,0297713682 / hedef ciro 1.560.717,48110121)
 * doğrudan kıyaslanır. DB'ye bağlı fonksiyonlar (`loadCashflowComputeInput`, `projectCashflow`,
 * `applyOverride`, `getBreakEven`, `getMonthToDate`, `getSensitivity`) bu saf motoru sarar.
 *
 * Excel satır eşlemesi (kaynak: packages/db/src/import/nakitakisi.ts + Varsayımlar/Kredi Takvimi):
 *  - satır 7-10 (kanal ciroları)  → `revenueByChannel` = kanal_aylık_ciro × senaryo çarpanı × (1+aylık büyüme)^ay
 *  - satır 11 (TOPLAM CİRO)       → `revenueTotal`
 *  - satır 12 (Tahsilat)          → `collections` = Σ kanal geliri[ay − tahsilat vadesi (ay)] (vade öncesi ilk aya sabitlenir)
 *  - satır 13 (Değişken gider)    → `variableCosts` = −Σ ciro_kanal × (1 − katkı marjı%)
 *  - satır 14 (BRÜT KÂR)          → `grossProfit`
 *  - satır 18-32 (Sabit giderler) → `fixedExpenses` = −Σ aylık sabit gider × (1+yıllık artış%)^yıl_indeksi
 *  - satır 34 (FAVÖK)             → `ebitda`
 *  - satır 36 (Kredi faizi+BSMV)  → `loanInterest` = −Σ(loan_installments.interest, period)
 *  - satır 38 (Kurumlar vergisi)  → `corporateTax` = −MAX(0, FAVÖK+faiz) × vergi oranı
 *  - satır 41 (Kredi anapara)     → `loanPrincipal` = −Σ(loan_installments.principal, period)
 *  - satır 42 (Net KDV)           → `netVat` = −TOPLAM CİRO × net KDV%
 *  - satır 43-44 (Diğer/Yatırım)  → `otherInflows` / `investments` (elle girilir — mavi hücre override)
 *  - satır 45 (NET NAKİT AKIŞI)   → `netCashflow` = tahsilat+değişken+sabit+faiz+vergi+anapara+KDV+diğer+yatırım
 *  - satır 46-47 (Dönem başı/sonu)→ `openingCash` / `closingCash` (zincirleme: bir sonraki ayın açılışı bu ayın kapanışı)
 *  - satır 49 (HEDEF CİRO)        → `breakEvenRevenue`
 */

export type Scenario = 'base' | 'optimistic' | 'pessimistic';
export const SCENARIOS: readonly Scenario[] = ['base', 'optimistic', 'pessimistic'];
export const SCENARIO_LABELS: Record<Scenario, string> = { base: 'Baz', optimistic: 'İyimser', pessimistic: 'Kötümser' };
/**
 * Excel'in kendi `scenario_multiplier` varsayımı (Varsayımlar!B9) tek bir "mevcut ciro" senaryosu
 * taşır — üç ayrı senaryo (base/optimistic/pessimistic) Excel'de yoktu, modül sözleşmesi ekranda üç
 * senaryo seçici ister. Karar (rapor edilmiştir): senaryolar Excel'in kendi çarpanının ÜZERİNE
 * çarpımsal bir düzeltme uygular — base = ×1 (Excel'i birebir üretir, testin dayanağı budur),
 * optimistic = ×1,15, pessimistic = ×0,85. `Varsayımlar!B9` (assumptions ekranından değiştirilebilir)
 * her üç senaryoyu da birlikte ölçekler.
 */
const SCENARIO_FACTOR: Record<Scenario, string> = { base: '1', optimistic: '1.15', pessimistic: '0.85' };

export const PROJECTION_MONTHS = 36;
/** Excel "Eyl 2026 → Ağu 2029" aralığının ilk ayı */
export const PROJECTION_START_PERIOD = '2026-09';

function parsePeriod(period: string): { y: number; m: number } {
  const [yStr, mStr] = period.split('-');
  return { y: Number(yStr), m: Number(mStr) };
}

/** `startPeriod`'dan `offset` ay sonrası (`YYYY-MM`) */
export function periodAtOffset(startPeriod: string, offset: number): string {
  const { y, m } = parsePeriod(startPeriod);
  const total = y * 12 + (m - 1) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** İki dönem arası ay farkı (`period` − `startPeriod`) */
export function periodOffset(startPeriod: string, period: string): number {
  const a = parsePeriod(startPeriod);
  const b = parsePeriod(period);
  return b.y * 12 + b.m - (a.y * 12 + a.m);
}

export function daysInMonth(period: string): number {
  const { y, m } = parsePeriod(period);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/* ------------------------------------------------------------------ */
/* Saf hesaplama motoru                                                 */
/* ------------------------------------------------------------------ */

export type ChannelAssumptionInput = { code: string; name: string; monthlyRevenue: Decimal; contributionMarginPct: Decimal; collectionLagMonths: number };

export type CashflowAssumptionsInput = {
  openingCash: Decimal;
  weightedMarginPct: Decimal;
  netVatPct: Decimal;
  corporateTaxRate: Decimal;
  cashBuffer: Decimal;
  scenarioMultiplier: Decimal;
  monthlyGrowthPct: Decimal;
  fixedCostIncreasePct: Decimal;
};

/** Dönem (`YYYY-MM`) → düz anahtar/değer override haritası: `revenue.<kanalKodu>`, `otherInflows`, `investments` */
export type CashflowOverrideMap = Map<string, Record<string, string>>;

export type CashflowComputeInput = {
  scenario: Scenario;
  months?: number;
  startPeriod?: string;
  assumptions: CashflowAssumptionsInput;
  channels: ChannelAssumptionInput[];
  fixedExpenseTotal: Decimal;
  loanByPeriod: Map<string, { interest: Decimal; principal: Decimal }>;
  overrides?: CashflowOverrideMap;
};

export type CashflowLine = {
  period: string;
  scenario: Scenario;
  revenueByChannel: Record<string, string>;
  revenueTotal: Decimal;
  collections: Decimal;
  variableCosts: Decimal;
  grossProfit: Decimal;
  fixedExpenses: Decimal;
  ebitda: Decimal;
  loanInterest: Decimal;
  loanPrincipal: Decimal;
  corporateTax: Decimal;
  netVat: Decimal;
  otherInflows: Decimal;
  investments: Decimal;
  netCashflow: Decimal;
  openingCash: Decimal;
  closingCash: Decimal;
  breakEvenRevenue: Decimal;
};

/** Tek bir dönem için hedef ciro (Excel satır 49) — `computeCashflowProjection` ve `getSensitivity` paylaşır */
function breakEvenFormula(opts: { fixedExpensesMag: Decimal; loanInterestMag: Decimal; loanPrincipalMag: Decimal; cashBuffer: Decimal; marginWeighted: Decimal; taxRate: Decimal; netVatPct: Decimal }): Decimal {
  const denom = opts.marginWeighted.mul(ONE.minus(opts.taxRate)).minus(opts.netVatPct);
  if (!denom.gt(0)) return ZERO;
  const numerator = opts.loanPrincipalMag.plus(opts.cashBuffer).plus(opts.fixedExpensesMag.plus(opts.loanInterestMag).mul(ONE.minus(opts.taxRate)));
  return numerator.div(denom);
}

/**
 * Saf projeksiyon motoru — DB'ye dokunmaz. `startPeriod`'dan başlayarak `months` ay için Excel'in
 * "Nakit Akışı" sayfasındaki her satırı üretir; dönem başı nakit bir önceki ayın kapanışına zincirlenir.
 */
export function computeCashflowProjection(input: CashflowComputeInput): CashflowLine[] {
  const months = input.months ?? PROJECTION_MONTHS;
  const startPeriod = input.startPeriod ?? PROJECTION_START_PERIOD;
  const a = input.assumptions;
  const scenarioFactor = D(SCENARIO_FACTOR[input.scenario]).mul(a.scenarioMultiplier);
  const growth = a.monthlyGrowthPct.div(100);
  const fixedIncrease = a.fixedCostIncreasePct.div(100);
  const marginWeighted = a.weightedMarginPct.div(100);
  const netVatPct = a.netVatPct.div(100);
  const taxRate = a.corporateTaxRate.div(100);

  // Kanal başına aylık gelir geçmişi: tahsilat vadesi (collectionLagMonths) her zaman ≥ 0 olduğundan
  // sıralı ilerleyişte kaynak ay her zaman zaten hesaplanmış olur (Excel'in INDEX/MATCH'iyle aynı sonuç).
  const revenueHistory = new Map<string, Decimal[]>(input.channels.map((c) => [c.code, []]));

  const lines: CashflowLine[] = [];
  let openingCash = a.openingCash;

  for (let m = 0; m < months; m++) {
    const period = periodAtOffset(startPeriod, m);
    const yearIndex = Math.floor(m / 12);
    const override = input.overrides?.get(period) ?? {};

    const revenueByChannel: Record<string, string> = {};
    let revenueTotal = ZERO;
    let variableCosts = ZERO;
    for (const c of input.channels) {
      const overrideVal = override[`revenue.${c.code}`];
      const revenue = overrideVal !== undefined ? D(overrideVal) : c.monthlyRevenue.mul(scenarioFactor).mul(ONE.plus(growth).pow(m));
      revenueByChannel[c.code] = toDb(revenue);
      revenueHistory.get(c.code)!.push(revenue);
      revenueTotal = revenueTotal.plus(revenue);
      variableCosts = variableCosts.minus(revenue.mul(ONE.minus(c.contributionMarginPct.div(100))));
    }

    let collections = ZERO;
    for (const c of input.channels) {
      const hist = revenueHistory.get(c.code)!;
      const srcIndex = Math.max(0, m - c.collectionLagMonths);
      collections = collections.plus(hist[srcIndex] ?? ZERO);
    }

    const grossProfit = revenueTotal.plus(variableCosts);
    const fixedExpensesLine = input.fixedExpenseTotal.neg().mul(ONE.plus(fixedIncrease).pow(yearIndex));
    const ebitda = grossProfit.plus(fixedExpensesLine);
    const loan = input.loanByPeriod.get(period);
    const loanInterest = (loan?.interest ?? ZERO).neg();
    const loanPrincipal = (loan?.principal ?? ZERO).neg();
    const pretax = ebitda.plus(loanInterest);
    const corporateTax = maxDecimal(pretax, ZERO).neg().mul(taxRate);
    const netVat = revenueTotal.neg().mul(netVatPct);
    const otherInflows = override.otherInflows !== undefined ? D(override.otherInflows) : ZERO;
    const investments = override.investments !== undefined ? D(override.investments) : ZERO;

    const netCashflow = collections.plus(variableCosts).plus(fixedExpensesLine).plus(loanInterest).plus(corporateTax).plus(loanPrincipal).plus(netVat).plus(otherInflows).plus(investments);
    const closingCash = openingCash.plus(netCashflow);

    const breakEvenRevenue = breakEvenFormula({
      fixedExpensesMag: fixedExpensesLine.neg(),
      loanInterestMag: loanInterest.neg(),
      loanPrincipalMag: loanPrincipal.neg(),
      cashBuffer: a.cashBuffer,
      marginWeighted,
      taxRate,
      netVatPct,
    });

    lines.push({
      period,
      scenario: input.scenario,
      revenueByChannel,
      revenueTotal: round4(revenueTotal),
      collections: round4(collections),
      variableCosts: round4(variableCosts),
      grossProfit: round4(grossProfit),
      fixedExpenses: round4(fixedExpensesLine),
      ebitda: round4(ebitda),
      loanInterest: round4(loanInterest),
      loanPrincipal: round4(loanPrincipal),
      corporateTax: round4(corporateTax),
      netVat: round4(netVat),
      otherInflows: round4(otherInflows),
      investments: round4(investments),
      netCashflow: round4(netCashflow),
      openingCash: round4(openingCash),
      closingCash: round4(closingCash),
      breakEvenRevenue: round4(breakEvenRevenue),
    });

    openingCash = closingCash;
  }

  return lines;
}

/* ------------------------------------------------------------------ */
/* DB'ye bağlı katman                                                   */
/* ------------------------------------------------------------------ */

async function loadAssumptionsMap(tx: DbOrTx): Promise<Map<string, Decimal>> {
  const rows = await tx.select().from(cashflowAssumptions);
  return new Map(rows.map((r) => [r.key, D(r.value)]));
}

function assumptionsFromMap(map: Map<string, Decimal>): CashflowAssumptionsInput {
  const get = (k: string) => map.get(k) ?? ZERO;
  return {
    openingCash: get('opening_cash'),
    weightedMarginPct: get('weighted_margin_pct'),
    netVatPct: get('net_vat_pct'),
    corporateTaxRate: get('corporate_tax_rate'),
    cashBuffer: get('cash_buffer'),
    scenarioMultiplier: get('scenario_multiplier'),
    monthlyGrowthPct: get('monthly_growth_pct'),
    fixedCostIncreasePct: get('fixed_cost_increase_pct'),
  };
}

async function loadChannels(tx: DbOrTx): Promise<ChannelAssumptionInput[]> {
  const rows = await tx
    .select({
      code: salesChannels.code,
      name: salesChannels.name,
      monthlyRevenue: channelAssumptions.monthlyRevenue,
      contributionMarginPct: channelAssumptions.contributionMarginPct,
      collectionLagMonths: channelAssumptions.collectionLagMonths,
    })
    .from(channelAssumptions)
    .innerJoin(salesChannels, eq(salesChannels.id, channelAssumptions.channelId))
    .orderBy(salesChannels.sortOrder);
  return rows.map((r) => ({ code: r.code, name: r.name, monthlyRevenue: D(r.monthlyRevenue), contributionMarginPct: D(r.contributionMarginPct), collectionLagMonths: r.collectionLagMonths }));
}

async function loadFixedExpenseTotal(tx: DbOrTx): Promise<Decimal> {
  const rows = await tx.select({ monthlyAmount: fixedExpenses.monthlyAmount }).from(fixedExpenses).where(eq(fixedExpenses.isActive, true));
  return sum(rows.map((r) => r.monthlyAmount));
}

async function loadLoanTotalsByPeriod(tx: DbOrTx): Promise<Map<string, { interest: Decimal; principal: Decimal }>> {
  const rows = await tx.select({ period: loanInstallments.period, interest: loanInstallments.interest, principal: loanInstallments.principal }).from(loanInstallments);
  const map = new Map<string, { interest: Decimal; principal: Decimal }>();
  for (const r of rows) {
    const cur = map.get(r.period) ?? { interest: ZERO, principal: ZERO };
    map.set(r.period, { interest: cur.interest.plus(D(r.interest)), principal: cur.principal.plus(D(r.principal)) });
  }
  return map;
}

async function loadOverrides(tx: DbOrTx, scenario: Scenario): Promise<CashflowOverrideMap> {
  const rows = await tx.select({ period: cashflowLines.period, overrides: cashflowLines.overrides }).from(cashflowLines).where(eq(cashflowLines.scenario, scenario));
  const map: CashflowOverrideMap = new Map();
  for (const r of rows) {
    const o = (r.overrides ?? {}) as Record<string, string>;
    if (Object.keys(o).length) map.set(r.period, o);
  }
  return map;
}

/** DB'den saf motorun girdisini yükler (senaryo başına: varsayımlar + kanallar + sabit giderler + kredi takvimi + mevcut override'lar) */
export async function loadCashflowComputeInput(tx: DbOrTx, scenario: Scenario, months = PROJECTION_MONTHS): Promise<CashflowComputeInput> {
  const [assumptionsMap, channels, fixedExpenseTotal, loanByPeriod, overrides] = await Promise.all([
    loadAssumptionsMap(tx), loadChannels(tx), loadFixedExpenseTotal(tx), loadLoanTotalsByPeriod(tx), loadOverrides(tx, scenario),
  ]);
  return { scenario, months, assumptions: assumptionsFromMap(assumptionsMap), channels, fixedExpenseTotal, loanByPeriod, overrides };
}

async function persistCashflowLines(tx: DbOrTx, lines: CashflowLine[]): Promise<void> {
  for (const l of lines) {
    const computedAt = new Date();
    const values = {
      revenueByChannel: l.revenueByChannel,
      revenueTotal: toDb(l.revenueTotal),
      collections: toDb(l.collections),
      variableCosts: toDb(l.variableCosts),
      grossProfit: toDb(l.grossProfit),
      fixedExpenses: toDb(l.fixedExpenses),
      ebitda: toDb(l.ebitda),
      loanInterest: toDb(l.loanInterest),
      loanPrincipal: toDb(l.loanPrincipal),
      corporateTax: toDb(l.corporateTax),
      netVat: toDb(l.netVat),
      otherInflows: toDb(l.otherInflows),
      investments: toDb(l.investments),
      netCashflow: toDb(l.netCashflow),
      closingCash: toDb(l.closingCash),
      breakEvenRevenue: toDb(l.breakEvenRevenue),
      computedAt,
    };
    // `actualRevenue`/`actualCollections`/`actualFixedExpenses`/`actualNetCashflow` ve `overrides`
    // kasıtlı olarak SET listesinde YOK: bunlar sırasıyla `refreshActuals` ve `applyOverride`
    // tarafından yazılır — her yeniden hesaplama bu iki bağımsız alanı SESSİZCE silmemeli.
    await tx
      .insert(cashflowLines)
      .values({ period: l.period, scenario: l.scenario, ...values })
      .onConflictDoUpdate({ target: [cashflowLines.scenario, cashflowLines.period], set: values });
  }
}

/**
 * Ana giriş noktası (modül sözleşmesi `projectCashflow(scenario)`). Varsayılan olarak hesaplanan
 * satırları `cashflow_lines`e yazar (`persist:false` salt-okunur önizleme için — ör. sayfa render'ı
 * sırasında istem dışı yazma yapmamak için kullanılır).
 */
export async function projectCashflow(tx: DbOrTx, scenario: Scenario, opts: { months?: number; persist?: boolean } = {}): Promise<CashflowLine[]> {
  const input = await loadCashflowComputeInput(tx, scenario, opts.months ?? PROJECTION_MONTHS);
  const lines = computeCashflowProjection(input);
  if (opts.persist !== false) await persistCashflowLines(tx, lines);
  return lines;
}

export type OverrideField = 'revenue' | 'otherInflows' | 'investments';

export type ApplyOverrideInput = {
  scenario: Scenario;
  period: string;
  field: OverrideField;
  /** field='revenue' için zorunlu */
  channelCode?: string;
  /** null/boş = override'ı kaldır (formüle dön) */
  value: string | null;
};

/**
 * Excel'deki "mavi hücreler": bir dönem/senaryo için kanal cirosu, diğer girişler veya yatırım
 * tutarını elle günceller (`cashflow_lines.overrides`, düz `alan.altAlan: değer` haritası) ve TÜM
 * projeksiyonu (36 ay) yeniden hesaplayıp kalıcı hale getirir — bir aydaki override, tahsilat vadesi
 * ve nakit zinciri yoluyla sonraki ayları da etkiler.
 */
export async function applyOverride(tx: DbOrTx, input: ApplyOverrideInput, opts: { months?: number } = {}): Promise<CashflowLine[]> {
  const key = input.field === 'revenue' ? `revenue.${input.channelCode}` : input.field;
  if (input.field === 'revenue' && !input.channelCode) throw new Error('applyOverride: field="revenue" için channelCode zorunlu');

  // `scenario` FİLTRESİ ZORUNLU: (scenario,period) benzersiz anahtarının aynı period için 3 satırı
  // olabilir (base/optimistic/pessimistic) — filtresiz sorgu ORDER BY olmadan rastgele bir senaryonun
  // override'larını okuyup YANLIŞ senaryonun satırına yazabilirdi (senaryolar arası çapraz bulaşma).
  const [existing] = await tx.select({ overrides: cashflowLines.overrides }).from(cashflowLines).where(and(eq(cashflowLines.period, input.period), eq(cashflowLines.scenario, input.scenario))).limit(1);
  const current = { ...((existing?.overrides ?? {}) as Record<string, string>) };
  if (input.value === null || input.value === '') delete current[key];
  else current[key] = D(input.value).toFixed(4);

  await tx
    .insert(cashflowLines)
    .values({ period: input.period, scenario: input.scenario, overrides: current })
    .onConflictDoUpdate({ target: [cashflowLines.scenario, cashflowLines.period], set: { overrides: current } });

  return projectCashflow(tx, input.scenario, { months: opts.months, persist: true });
}

/* ------------------------------------------------------------------ */
/* Canlı başabaş (break-even)                                           */
/* ------------------------------------------------------------------ */

export type MonthToDateResult = {
  period: string;
  actualNetRevenue: Decimal;
  daysElapsed: number;
  daysInMonth: number;
  daysRemaining: number;
  dailyPaceActual: Decimal;
  dailyPaceNeeded: Decimal;
  progressPct: Decimal;
};

/** Ayın bugüne kadarki gerçekleşen net cirosu (600+601−610, muhasebeden) ve gereken günlük tempo */
export async function getMonthToDate(tx: DbOrTx, period: string, breakEvenRevenue: Decimal): Promise<MonthToDateResult> {
  const total = daysInMonth(period);
  const monthStart = `${period}-01`;
  const monthEnd = `${period}-${String(total).padStart(2, '0')}`;
  const todayIso = businessDate(new Date());
  const asOf = todayIso < monthStart ? monthStart : todayIso > monthEnd ? monthEnd : todayIso;
  const daysElapsed = todayIso < monthStart ? 0 : todayIso > monthEnd ? total : Number(asOf.slice(8, 10));
  const daysRemaining = Math.max(0, total - daysElapsed);

  const [bal600, bal601, bal610] = await Promise.all([
    getAccountBalance(tx, { accountCode: '600', ledger: 'VUK', from: monthStart, asOf: monthEnd }),
    getAccountBalance(tx, { accountCode: '601', ledger: 'VUK', from: monthStart, asOf: monthEnd }),
    getAccountBalance(tx, { accountCode: '610', ledger: 'VUK', from: monthStart, asOf: monthEnd }),
  ]);
  const actualNetRevenue = bal600.plus(bal601).plus(bal610).neg();

  const dailyPaceActual = daysElapsed > 0 ? actualNetRevenue.div(daysElapsed) : ZERO;
  const gap = breakEvenRevenue.minus(actualNetRevenue);
  const dailyPaceNeeded = daysRemaining > 0 ? maxDecimal(gap, ZERO).div(daysRemaining) : ZERO;
  const progressPct = breakEvenRevenue.gt(0) ? actualNetRevenue.div(breakEvenRevenue).mul(100) : ZERO;

  return { period, actualNetRevenue: round4(actualNetRevenue), daysElapsed, daysInMonth: total, daysRemaining, dailyPaceActual: round4(dailyPaceActual), dailyPaceNeeded: round4(dailyPaceNeeded), progressPct: round4(progressPct) };
}

export type BreakEvenResult = {
  period: string;
  scenario: Scenario;
  targetRevenue: Decimal;
  weightedMarginPct: Decimal;
  fixedExpensesMag: Decimal;
  loanInstallmentMag: Decimal;
  corporateTaxRatePct: Decimal;
  cashBuffer: Decimal;
  channelShare: Array<{ code: string; name: string; revenue: Decimal; share: Decimal }>;
  monthToDate: MonthToDateResult;
};

/** "Bu ay gereken minimum ciro" + gerçekleşenle karşılaştırma (`/finans/break-even`) */
export async function getBreakEven(tx: DbOrTx, period: string, scenario: Scenario = 'base'): Promise<BreakEvenResult> {
  const input = await loadCashflowComputeInput(tx, scenario, PROJECTION_MONTHS);
  const lines = computeCashflowProjection(input);
  const line = lines.find((l) => l.period === period) ?? lines[0]!;

  const revenueTotal = line.revenueTotal.isZero() ? ONE : line.revenueTotal;
  const channelShare = input.channels.map((c) => {
    const revenue = D(line.revenueByChannel[c.code] ?? '0');
    return { code: c.code, name: c.name, revenue: round4(revenue), share: line.breakEvenRevenue.mul(revenue.div(revenueTotal)) };
  });

  const monthToDate = await getMonthToDate(tx, period, line.breakEvenRevenue);

  return {
    period,
    scenario,
    targetRevenue: line.breakEvenRevenue,
    weightedMarginPct: input.assumptions.weightedMarginPct,
    fixedExpensesMag: line.fixedExpenses.neg(),
    loanInstallmentMag: line.loanInterest.neg().plus(line.loanPrincipal.neg()),
    corporateTaxRatePct: input.assumptions.corporateTaxRate,
    cashBuffer: input.assumptions.cashBuffer,
    channelShare: channelShare.map((c) => ({ ...c, share: round4(c.share) })),
    monthToDate,
  };
}

/* ------------------------------------------------------------------ */
/* Duyarlılık tabloları (Excel'de ayrı bir sayfa yok — modül sözleşmesinin                */
/* istediği "marj × ciro" / "toptan ciro senaryoları" tabloları burada TÜRETİLİR)          */
/* ------------------------------------------------------------------ */

export type SensitivityResult = {
  period: string;
  /** Duyarlılık 1: marj puanı deltası (satır) × ciro çarpanı (kolon) → net nakit akışı */
  marginRevenueGrid: { marginDeltaPts: number; multiplier: number; netCashflow: Decimal }[];
  /** Duyarlılık 2: toptan/fason kanal ciro senaryoları → ağırlıklı marj ve hedef ciro etkisi */
  wholesaleScenarios: { wholesaleRevenue: Decimal; weightedMarginPct: Decimal; targetRevenue: Decimal }[];
};

const MARGIN_DELTAS_PTS = [-10, -5, 0, 5, 10];
const REVENUE_MULTIPLIERS = [0.8, 0.9, 1, 1.1, 1.2];
const WHOLESALE_SCENARIO_FACTORS = [0.65, 0.85, 1, 1.15, 1.35];

/** Wholesale/toptan kanalın Excel kodu (Varsayımlar!B34 satırı) */
const WHOLESALE_CODE = 'TOPTAN';

export async function getSensitivity(tx: DbOrTx, period: string, scenario: Scenario = 'base'): Promise<SensitivityResult> {
  const input = await loadCashflowComputeInput(tx, scenario, PROJECTION_MONTHS);
  const lines = computeCashflowProjection(input);
  const line = lines.find((l) => l.period === period) ?? lines[0]!;
  const a = input.assumptions;
  const taxRate = a.corporateTaxRate.div(100);
  const netVatPct = a.netVatPct.div(100);
  const fixedMag = line.fixedExpenses.neg();
  const loanIntMag = line.loanInterest.neg();
  const loanPrincMag = line.loanPrincipal.neg();

  const marginRevenueGrid: SensitivityResult['marginRevenueGrid'] = [];
  for (const deltaPts of MARGIN_DELTAS_PTS) {
    for (const mult of REVENUE_MULTIPLIERS) {
      const margin = a.weightedMarginPct.plus(deltaPts).div(100);
      const revenue = line.revenueTotal.mul(mult);
      // Tahsilat ≈ ciro varsayılır (bu tabloda tahsilat vadesi etkisi ihmal edilir — tek aylık
      // "eğer bu ay bu marj/ciroda olsaydık" anlık duyarlılığı, 36 aylık zincirleme tahsilat değil).
      // netCashflow = tahsilat − değişken gider − sabit gider − faiz − vergi − anapara − netKDV
      //             = ciro − (ciro − brütKâr) − sabit − faiz − vergi − anapara − netKDV
      //             = brütKâr − sabit − faiz − vergi − anapara − netKDV  (brüt kâr ZATEN değişken
      // gideri çıkarılmış haldedir — `ciro.minus(...)` kullanmak değişken gideri iki kez düşürür/hiç
      // düşürmezdi; bkz. Tur 1 kendi bulgusu: 0pp/×1 hücresi gerçek ayın net nakit akışından
      // (33.278) 26 kat büyük (863.278) çıkıyordu çünkü tüm ciro yanlışlıkla tahsilat+brüt kâr GİBİ
      // aynı anda kullanılıyordu).
      const grossProfit = revenue.mul(margin);
      const ebitda = grossProfit.minus(fixedMag);
      const pretax = ebitda.minus(loanIntMag);
      const tax = maxDecimal(pretax, ZERO).mul(taxRate);
      const netVat = revenue.mul(netVatPct);
      const netCashflow = pretax.minus(tax).minus(loanPrincMag).minus(netVat);
      marginRevenueGrid.push({ marginDeltaPts: deltaPts, multiplier: mult, netCashflow: round4(netCashflow) });
    }
  }

  const wholesale = input.channels.find((c) => c.code === WHOLESALE_CODE);
  const otherRevenue = sum(input.channels.filter((c) => c.code !== WHOLESALE_CODE).map((c) => D(line.revenueByChannel[c.code] ?? '0')));
  const otherContribution = sum(
    input.channels.filter((c) => c.code !== WHOLESALE_CODE).map((c) => D(line.revenueByChannel[c.code] ?? '0').mul(c.contributionMarginPct.div(100))),
  );

  const wholesaleScenarios: SensitivityResult['wholesaleScenarios'] = wholesale
    ? WHOLESALE_SCENARIO_FACTORS.map((factor) => {
        const wholesaleRevenue = wholesale.monthlyRevenue.mul(factor);
        const totalRevenue = otherRevenue.plus(wholesaleRevenue);
        const totalContribution = otherContribution.plus(wholesaleRevenue.mul(wholesale.contributionMarginPct.div(100)));
        const weightedMarginPct = totalRevenue.gt(0) ? totalContribution.div(totalRevenue).mul(100) : ZERO;
        const targetRevenue = breakEvenFormula({
          fixedExpensesMag: fixedMag,
          loanInterestMag: loanIntMag,
          loanPrincipalMag: loanPrincMag,
          cashBuffer: a.cashBuffer,
          marginWeighted: weightedMarginPct.div(100),
          taxRate,
          netVatPct,
        });
        return { wholesaleRevenue: round4(wholesaleRevenue), weightedMarginPct: round4(weightedMarginPct), targetRevenue: round4(targetRevenue) };
      })
    : [];

  return { period, marginRevenueGrid, wholesaleScenarios };
}

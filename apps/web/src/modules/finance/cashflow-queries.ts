import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, cashflowAssumptions, cashflowLines, salesChannels, channelAssumptions } from '@plantero/db';
import { projectCashflow, getBreakEven, getSensitivity, type Scenario, type CashflowLine, type BreakEvenResult, type SensitivityResult } from '@plantero/core';

/** Ekrana giden düz (string) DTO — Decimal sunucu bileşeninden istemciye geçemez */
export type CashflowLineDto = {
  period: string;
  revenueByChannel: Record<string, string>;
  revenueTotal: string;
  collections: string;
  variableCosts: string;
  grossProfit: string;
  fixedExpenses: string;
  ebitda: string;
  loanInterest: string;
  loanPrincipal: string;
  corporateTax: string;
  netVat: string;
  otherInflows: string;
  investments: string;
  netCashflow: string;
  openingCash: string;
  closingCash: string;
  breakEvenRevenue: string;
  actualRevenue: string | null;
  actualCollections: string | null;
  actualFixedExpenses: string | null;
  actualNetCashflow: string | null;
};

function toDto(l: CashflowLine): Omit<CashflowLineDto, 'actualRevenue' | 'actualCollections' | 'actualFixedExpenses' | 'actualNetCashflow'> {
  return {
    period: l.period,
    revenueByChannel: l.revenueByChannel,
    revenueTotal: l.revenueTotal.toFixed(4),
    collections: l.collections.toFixed(4),
    variableCosts: l.variableCosts.toFixed(4),
    grossProfit: l.grossProfit.toFixed(4),
    fixedExpenses: l.fixedExpenses.toFixed(4),
    ebitda: l.ebitda.toFixed(4),
    loanInterest: l.loanInterest.toFixed(4),
    loanPrincipal: l.loanPrincipal.toFixed(4),
    corporateTax: l.corporateTax.toFixed(4),
    netVat: l.netVat.toFixed(4),
    otherInflows: l.otherInflows.toFixed(4),
    investments: l.investments.toFixed(4),
    netCashflow: l.netCashflow.toFixed(4),
    openingCash: l.openingCash.toFixed(4),
    closingCash: l.closingCash.toFixed(4),
    breakEvenRevenue: l.breakEvenRevenue.toFixed(4),
  };
}

export type ChannelRef = { id: string; code: string; name: string };

export async function listChannelRefs(): Promise<ChannelRef[]> {
  const rows = await db
    .select({ id: salesChannels.id, code: salesChannels.code, name: salesChannels.name })
    .from(channelAssumptions)
    .innerJoin(salesChannels, eq(salesChannels.id, channelAssumptions.channelId))
    .orderBy(asc(salesChannels.sortOrder));
  return rows;
}

/** Nakit akışı sayfası: 36 aylık projeksiyon (salt-okunur — DB'ye yazmaz) + gerçekleşen (varsa) birleştirilmiş */
export async function getCashflowPage(scenario: Scenario): Promise<{ lines: CashflowLineDto[]; channels: ChannelRef[]; computedAt: Date | null }> {
  const [lines, actualsRows, channels] = await Promise.all([
    projectCashflow(db, scenario, { persist: false }),
    // `scenario='base'` ZORUNLU: (scenario,period) benzersiz anahtarının aynı period için 3 satırı
    // olabilir (base/optimistic/pessimistic) — `refreshActuals` yalnızca 'base'e yazar, diğer ikisinde
    // actual* hep NULL'dur. Filtresiz sorgu ORDER BY olmadan rastgele bir satır dönebilir, bu da
    // "Gerçekleşen ciro/net nakit" satırlarının sessizce boş görünmesine yol açardı (kök neden,
    // `budget.test.ts`teki aynı sınıf hatanın üretim koddaki karşılığı). Gerçekleşen veri zaten
    // senaryodan bağımsız bir gerçektir (hangi senaryo görüntüleniyor olursa olsun aynı gerçek rakam).
    db.select({ period: cashflowLines.period, actualRevenue: cashflowLines.actualRevenue, actualCollections: cashflowLines.actualCollections, actualFixedExpenses: cashflowLines.actualFixedExpenses, actualNetCashflow: cashflowLines.actualNetCashflow, computedAt: cashflowLines.computedAt }).from(cashflowLines).where(eq(cashflowLines.scenario, 'base')),
    listChannelRefs(),
  ]);
  const actualByPeriod = new Map(actualsRows.map((r) => [r.period, r]));
  let latestComputedAt: Date | null = null;
  for (const r of actualsRows) if (r.computedAt && (!latestComputedAt || r.computedAt > latestComputedAt)) latestComputedAt = r.computedAt;

  const dtos: CashflowLineDto[] = lines.map((l) => {
    const actual = actualByPeriod.get(l.period);
    return { ...toDto(l), actualRevenue: actual?.actualRevenue ?? null, actualCollections: actual?.actualCollections ?? null, actualFixedExpenses: actual?.actualFixedExpenses ?? null, actualNetCashflow: actual?.actualNetCashflow ?? null };
  });

  return { lines: dtos, channels, computedAt: latestComputedAt };
}

export type AssumptionRow = { key: string; value: string; label: string; description: string | null };

export async function getAssumptions(): Promise<AssumptionRow[]> {
  const rows = await db.select().from(cashflowAssumptions).orderBy(asc(cashflowAssumptions.key));
  return rows.map((r) => ({ key: r.key, value: r.value, label: r.label, description: r.description }));
}

export type ChannelAssumptionRow = { channelId: string; code: string; name: string; monthlyRevenue: string; contributionMarginPct: string; collectionLagMonths: number };

export async function getChannelAssumptions(): Promise<ChannelAssumptionRow[]> {
  const rows = await db
    .select({ channelId: channelAssumptions.channelId, code: salesChannels.code, name: salesChannels.name, monthlyRevenue: channelAssumptions.monthlyRevenue, contributionMarginPct: channelAssumptions.contributionMarginPct, collectionLagMonths: channelAssumptions.collectionLagMonths })
    .from(channelAssumptions)
    .innerJoin(salesChannels, eq(salesChannels.id, channelAssumptions.channelId))
    .orderBy(asc(salesChannels.sortOrder));
  return rows;
}

export type BreakEvenDto = {
  period: string;
  scenario: Scenario;
  targetRevenue: string;
  weightedMarginPct: string;
  fixedExpensesMag: string;
  loanInstallmentMag: string;
  corporateTaxRatePct: string;
  cashBuffer: string;
  channelShare: Array<{ code: string; name: string; revenue: string; share: string }>;
  monthToDate: { period: string; actualNetRevenue: string; daysElapsed: number; daysInMonth: number; daysRemaining: number; dailyPaceActual: string; dailyPaceNeeded: string; progressPct: string };
};

function breakEvenToDto(r: BreakEvenResult): BreakEvenDto {
  return {
    period: r.period,
    scenario: r.scenario,
    targetRevenue: r.targetRevenue.toFixed(4),
    weightedMarginPct: r.weightedMarginPct.toFixed(4),
    fixedExpensesMag: r.fixedExpensesMag.toFixed(4),
    loanInstallmentMag: r.loanInstallmentMag.toFixed(4),
    corporateTaxRatePct: r.corporateTaxRatePct.toFixed(4),
    cashBuffer: r.cashBuffer.toFixed(4),
    channelShare: r.channelShare.map((c) => ({ code: c.code, name: c.name, revenue: c.revenue.toFixed(4), share: c.share.toFixed(4) })),
    monthToDate: {
      period: r.monthToDate.period, actualNetRevenue: r.monthToDate.actualNetRevenue.toFixed(4), daysElapsed: r.monthToDate.daysElapsed,
      daysInMonth: r.monthToDate.daysInMonth, daysRemaining: r.monthToDate.daysRemaining,
      dailyPaceActual: r.monthToDate.dailyPaceActual.toFixed(4), dailyPaceNeeded: r.monthToDate.dailyPaceNeeded.toFixed(4), progressPct: r.monthToDate.progressPct.toFixed(4),
    },
  };
}

export async function getBreakEvenPage(period: string, scenario: Scenario = 'base'): Promise<BreakEvenDto> {
  const result = await getBreakEven(db, period, scenario);
  return breakEvenToDto(result);
}

export type SensitivityDto = {
  period: string;
  marginRevenueGrid: { marginDeltaPts: number; multiplier: number; netCashflow: string }[];
  wholesaleScenarios: { wholesaleRevenue: string; weightedMarginPct: string; targetRevenue: string }[];
};

export async function getSensitivityPage(period: string, scenario: Scenario = 'base'): Promise<SensitivityDto> {
  const r: SensitivityResult = await getSensitivity(db, period, scenario);
  return {
    period: r.period,
    marginRevenueGrid: r.marginRevenueGrid.map((x) => ({ ...x, netCashflow: x.netCashflow.toFixed(4) })),
    wholesaleScenarios: r.wholesaleScenarios.map((x) => ({ wholesaleRevenue: x.wholesaleRevenue.toFixed(4), weightedMarginPct: x.weightedMarginPct.toFixed(4), targetRevenue: x.targetRevenue.toFixed(4) })),
  };
}

/** Bugünkü Türkiye takvim ayı (`YYYY-MM`) — break-even ve nakit akışı varsayılan dönemi */
export function currentPeriod(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return `${y}-${m}`;
}

import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, budgets, budgetLines, salesChannels } from '@plantero/db';

export type BudgetLineRow = {
  id: string;
  period: string;
  kind: string;
  label: string;
  channelName: string | null;
  accountCode: string | null;
  planned: string;
  actual: string;
  variance: string;
};

export type BudgetOverview = { budgetId: string | null; year: number; name: string | null; status: string | null; lines: BudgetLineRow[] };

/** `/finans/butce`: yıla ait bütçe + tüm satırları (kanal/hesap adıyla birlikte) */
export async function getBudgetOverview(year: number): Promise<BudgetOverview> {
  const [budget] = await db.select().from(budgets).where(eq(budgets.year, year)).orderBy(asc(budgets.name)).limit(1);
  if (!budget) return { budgetId: null, year, name: null, status: null, lines: [] };

  const rows = await db
    .select({ bl: budgetLines, channelName: salesChannels.name })
    .from(budgetLines)
    .leftJoin(salesChannels, eq(salesChannels.id, budgetLines.channelId))
    .where(eq(budgetLines.budgetId, budget.id))
    .orderBy(asc(budgetLines.period), asc(budgetLines.kind));

  return {
    budgetId: budget.id,
    year: budget.year,
    name: budget.name,
    status: budget.status,
    lines: rows.map((r) => ({ id: r.bl.id, period: r.bl.period, kind: r.bl.kind, label: r.bl.label, channelName: r.channelName, accountCode: r.bl.accountCode, planned: r.bl.planned, actual: r.bl.actual, variance: r.bl.variance })),
  };
}

export async function listBudgetYears(): Promise<number[]> {
  const rows = await db.select({ year: budgets.year }).from(budgets).orderBy(asc(budgets.year));
  return [...new Set(rows.map((r) => r.year))];
}

/** Kanal/hesap kırılımı özet — grafik için (kind bazında ay×plan/gerçek toplamı) */
export async function getBudgetSummaryByKind(year: number): Promise<Array<{ period: string; kind: string; planned: string; actual: string }>> {
  const [budget] = await db.select({ id: budgets.id }).from(budgets).where(eq(budgets.year, year)).limit(1);
  if (!budget) return [];
  const rows = await db
    .select({ period: budgetLines.period, kind: budgetLines.kind, planned: budgetLines.planned, actual: budgetLines.actual })
    .from(budgetLines)
    .where(and(eq(budgetLines.budgetId, budget.id), inArray(budgetLines.kind, ['revenue', 'fixed_expense'])))
    .orderBy(asc(budgetLines.period));
  const byKey = new Map<string, { period: string; kind: string; planned: number; actual: number }>();
  for (const r of rows) {
    const key = `${r.period}:${r.kind}`;
    const cur = byKey.get(key) ?? { period: r.period, kind: r.kind, planned: 0, actual: 0 };
    cur.planned += Number(r.planned);
    cur.actual += Number(r.actual);
    byKey.set(key, cur);
  }
  return [...byKey.values()].map((v) => ({ period: v.period, kind: v.kind, planned: v.planned.toFixed(4), actual: v.actual.toFixed(4) }));
}

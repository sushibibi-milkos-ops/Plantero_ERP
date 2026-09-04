import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { forecasts, invoices, salesChannels, cashflowLines, type DbOrTx } from '@plantero/db';
import { D, toDb } from '../money.js';
import { writeAudit } from '../audit/index.js';
import { applyOverride, periodAtOffset, type Scenario } from './cashflow.js';
import type { ActorCtx } from '../types.js';

/**
 * AI satış/nakit tahmini (`/finans/tahmin`) — veri hazırlama + kalıcılaştırma katmanı.
 *
 * `packages/core` HİÇBİR entegrasyon paketini import ETMEZ (bkz. `accounting/einvoice.ts` başlık
 * yorumu) — bu yüzden `@plantero/ai`nin `forecastSales`/`forecastCash` çağrıları BURADA DEĞİL, web
 * katmanında (`apps/web/src/modules/finance/actions.ts`) yapılır; tıpkı `apps/worker/src/jobs/
 * cashflowRecompute.ts`nin kendi `forecastCash` çağrısını yapıp `forecasts` tablosuna kendisinin
 * yazması gibi. Bu dosya AI'nin ihtiyaç duyduğu geçmiş veriyi (`loadSalesHistory`/`loadCashHistory`)
 * hazırlar ve sonucu kalıcılaştırır (`saveForecasts`) + isteğe bağlı nakit akışı senaryosuna uygular
 * (`applyForecastToCashflow`).
 */

export type SalesHistoryPoint = { period: string; amount: string };

/**
 * Son `months` TAMAMLANMIŞ ay için (opsiyonel: tek kanal) aylık satış cirosu (grandTotal − iadeler),
 * eskiden yeniye sıralı. İÇİNDE BULUNULAN (henüz bitmemiş) ay kasıtlı olarak DIŞLANIR: örn. ayın 4'ünde
 * bakılırsa o ayın cirosu tam ayın yalnızca ~%13'ünü yansıtır — trend/mevsimsel tahmin bu kısmi ayı
 * "sert düşüş" sanıp aşağı yönlü sapan bir tahmin üretirdi (Tur 1 kendi bulgusu: /finans/tahmin
 * grafiğinde 2 aylık geçmişin 45B'den ~0'a düşen sahte bir eğim çizdiği görüldü).
 */
export async function loadSalesHistory(tx: DbOrTx, opts: { months?: number; channelId?: string } = {}): Promise<SalesHistoryPoint[]> {
  const months = opts.months ?? 12;
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1)).toISOString().slice(0, 10);
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

  const conds = [inArray(invoices.kind, ['sales', 'sales_return']), gte(invoices.invoiceDate, since), lt(invoices.invoiceDate, currentMonthStart)];
  if (opts.channelId) conds.push(eq(invoices.channelId, opts.channelId));

  const rows = await tx
    .select({ period: sql<string>`to_char(${invoices.invoiceDate}, 'YYYY-MM')`, kind: invoices.kind, total: sql<string>`coalesce(sum(${invoices.grandTotal}), 0)` })
    .from(invoices)
    .where(and(...conds))
    .groupBy(sql`to_char(${invoices.invoiceDate}, 'YYYY-MM')`, invoices.kind);

  const byPeriod = new Map<string, ReturnType<typeof D>>();
  for (const r of rows) {
    const sign = r.kind === 'sales_return' ? -1 : 1;
    byPeriod.set(r.period, (byPeriod.get(r.period) ?? D(0)).plus(D(r.total).mul(sign)));
  }
  return [...byPeriod.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, amount]) => ({ period, amount: toDb(amount) }));
}

/** Aylık kanal listesi (kod+ad) — tahmin ekranındaki kanal seçici için */
export async function listForecastChannels(tx: DbOrTx) {
  return tx.select({ id: salesChannels.id, code: salesChannels.code, name: salesChannels.name }).from(salesChannels).where(eq(salesChannels.isActive, true)).orderBy(salesChannels.sortOrder);
}

/** `cashflow_lines.actual_net_cashflow` geçmişi — worker `cashflow-recompute` ile aynı kaynak */
export async function loadCashHistory(tx: DbOrTx, opts: { scenario?: Scenario } = {}): Promise<SalesHistoryPoint[]> {
  const rows = await tx
    .select({ period: cashflowLines.period, actualNetCashflow: cashflowLines.actualNetCashflow })
    .from(cashflowLines)
    .where(and(eq(cashflowLines.scenario, opts.scenario ?? 'base'), sql`${cashflowLines.actualNetCashflow} is not null`))
    .orderBy(cashflowLines.period);
  return rows.map((r) => ({ period: r.period, amount: r.actualNetCashflow! }));
}

export type SaveForecastInput = { kind: 'sales' | 'cash' | 'channel_sales'; period: string; channelId?: string | null; predicted: string; low?: string | null; high?: string | null; method: string; rationale?: string | null };

/** Tahmin noktalarını `forecasts`e yazar (aynı kind+period+channel için üstüne yazar — "Yeniden üret") */
export async function saveForecasts(tx: DbOrTx, points: SaveForecastInput[], ctx: ActorCtx): Promise<number> {
  let written = 0;
  for (const p of points) {
    await tx.insert(forecasts).values({ kind: p.kind, period: p.period, channelId: p.channelId ?? null, predicted: p.predicted, low: p.low ?? null, high: p.high ?? null, method: p.method, rationale: p.rationale ?? null });
    written++;
  }
  if (written) await writeAudit(tx, { action: 'other', tableName: 'forecasts', summary: `${written} tahmin noktası üretildi (${points[0]?.kind}, yöntem: ${points[0]?.method})` }, ctx);
  return written;
}

export type ForecastRow = { id: string; kind: string; period: string; channelId: string | null; channelName: string | null; predicted: string; low: string | null; high: string | null; method: string; rationale: string | null; generatedAt: Date };

/** Her (kind,period,channel) kombinasyonu için EN SON üretilen tahmin — "Yeniden üret" eski taslakları görünmez kılar */
export async function getLatestForecasts(tx: DbOrTx, kind: 'sales' | 'cash' | 'channel_sales'): Promise<ForecastRow[]> {
  const rows = await tx
    .select({ f: forecasts, channelName: salesChannels.name })
    .from(forecasts)
    .leftJoin(salesChannels, eq(salesChannels.id, forecasts.channelId))
    .where(eq(forecasts.kind, kind))
    .orderBy(desc(forecasts.generatedAt));
  const seen = new Set<string>();
  const out: ForecastRow[] = [];
  for (const r of rows) {
    const key = `${r.f.period}:${r.f.channelId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.f.id, kind: r.f.kind, period: r.f.period, channelId: r.f.channelId, channelName: r.channelName, predicted: r.f.predicted, low: r.f.low, high: r.f.high, method: r.f.method, rationale: r.f.rationale, generatedAt: r.f.generatedAt });
  }
  return out.sort((a, b) => (a.period < b.period ? -1 : 1));
}

/**
 * Bir kanal satış tahminini nakit akışı senaryosuna uygular: o dönem için `revenue.<kanal>` mavi
 * hücre override'ını tahmin edilen tutara set eder (`applyOverride` üzerinden — tüm zincir yeniden hesaplanır).
 */
export async function applyForecastToCashflow(tx: DbOrTx, forecastId: string, scenario: Scenario, ctx: ActorCtx) {
  void ctx;
  const [row] = await tx.select({ f: forecasts, channelCode: salesChannels.code }).from(forecasts).leftJoin(salesChannels, eq(salesChannels.id, forecasts.channelId)).where(eq(forecasts.id, forecastId)).limit(1);
  if (!row || !row.channelCode) throw new Error('Bu tahmin bir kanala bağlı değil — nakit akışına uygulanamaz (yalnızca channel_sales tahminleri desteklenir)');
  return applyOverride(tx, { scenario, period: row.f.period, field: 'revenue', channelCode: row.channelCode, value: row.f.predicted });
}

/** `PROJECTION_START_PERIOD`'dan itibaren N. ay — tahmin ekranında "gelecek 6 ay" etiketleri için */
export { periodAtOffset };

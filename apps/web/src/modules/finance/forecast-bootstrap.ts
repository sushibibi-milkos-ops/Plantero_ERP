import 'server-only';
import { eq } from 'drizzle-orm';
import { db, bankAccounts, fixedExpenses, loanInstallments } from '@plantero/db';
import { D, sum, toDb, loadSalesHistory, loadCashHistory, listForecastChannels, saveForecasts, SYSTEM_ACTOR, type SaveForecastInput } from '@plantero/core';
import { forecastSales, forecastCash, type CashflowForecastInput } from '@plantero/ai';

/**
 * `/finans/tahmin` ilk açıldığında `forecasts` tablosu tamamen boşsa (henüz kimse "Yeniden üret"
 * butonuna basmadıysa) sunucuda bir kez tohum tahmin üretir ve kalıcılaştırır.
 *
 * Kök neden (finans-tahmin-05, Tur 3 P1): forecasts 0 satır olduğu için 4 KPI'nın 2'si "—"/2'si 0,
 * 3 karttan 2'si boş durumdaydı — grafiklerin veri kaynağı YALNIZCA bu tabloydu, `loadSalesHistory`
 * kasıtlı olarak cari (bitmemiş) ayı dışlar (bkz. forecast.ts başlık yorumu — DOĞRU davranış,
 * DEĞİŞTİRİLMEDİ) ve seed'de kimse tahmini üretmemişti. `packages/db` `@plantero/ai`yi import
 * EDEMEZ (döngüsel bağımlılık — forecast.ts başlık yorumu), bu yüzden bu adım seed'de değil, web
 * katmanında (bu dosya) çalışır — `generateSalesForecastAction`/`generateCashForecastAction`
 * (`forecast-actions.ts`) ile AYNI hesaplamayı yapar, tek fark tetikleyici ("buton" yerine "tablo
 * boşsa sayfa ilk açıldığında"). `saveForecasts` kendi audit satırını yazar (packages/core/audit) —
 * `SYSTEM_ACTOR` bu adımın bir kullanıcı eylemi değil sistem-başlatmalı olduğunu audit'te işaretler.
 *
 * İdempotent: yalnızca 'use server' OLMAYAN sunucu-taraflı bir yardımcıdır (client'a asla bir server
 * action referansı olarak sızmaz) ve çağrıldığında bile toSave boşsa hiçbir yazma yapmaz; ikinci sayfa
 * yüklemesinde forecasts artık boş olmadığından (çağıran taraf `salesForecast.length === 0` kontrolü
 * yapar) tekrar tetiklenmez.
 */
export async function ensureInitialForecasts(): Promise<void> {
  const [overallHistory, channels] = await Promise.all([loadSalesHistory(db, { months: 12 }), listForecastChannels(db)]);
  const toSave: SaveForecastInput[] = [];

  if (overallHistory.length > 0) {
    const overallPoints = await forecastSales(overallHistory, 6);
    toSave.push(...overallPoints.map((p) => ({ kind: 'sales' as const, period: p.period, predicted: p.predicted, low: p.low, high: p.high, method: p.method, rationale: p.rationale })));

    for (const c of channels) {
      const hist = await loadSalesHistory(db, { months: 12, channelId: c.id });
      // bkz. generateSalesForecastAction: genç şirket erken aşamada bazı kanallarda tek tamamlanmış
      // ay bile olabilir — eşik yalnızca HİÇ veri yoksa atlar.
      if (hist.length < 1) continue;
      const points = await forecastSales(hist, 6);
      toSave.push(...points.map((p) => ({ kind: 'channel_sales' as const, period: p.period, channelId: c.id, predicted: p.predicted, low: p.low, high: p.high, method: p.method, rationale: p.rationale })));
    }
  }

  const cashHistory = await loadCashHistory(db);
  if (cashHistory.length >= 2) {
    const [accounts, activeExpenses, installments] = await Promise.all([
      db.select({ balance: bankAccounts.statementBalance }).from(bankAccounts).where(eq(bankAccounts.isActive, true)),
      db.select({ monthlyAmount: fixedExpenses.monthlyAmount }).from(fixedExpenses).where(eq(fixedExpenses.isActive, true)),
      db.select({ period: loanInstallments.period, installment: loanInstallments.installment }).from(loanInstallments).where(eq(loanInstallments.status, 'scheduled')),
    ]);
    const currentBalance = toDb(sum(accounts.map((a) => a.balance)));
    const fixedMonthlyExpenses = toDb(sum(activeExpenses.map((e) => e.monthlyAmount)));
    const byMonth = new Map<string, ReturnType<typeof D>>();
    for (const i of installments) byMonth.set(i.period, (byMonth.get(i.period) ?? D(0)).plus(D(i.installment)));
    const loanInstallmentsByMonth = [...byMonth.entries()].map(([period, amount]) => ({ period, amount: toDb(amount) }));

    const cashInput: CashflowForecastInput = { currentBalance, history: cashHistory, fixedMonthlyExpenses, loanInstallmentsByMonth };
    const points = await forecastCash(cashInput, 3);
    toSave.push(...points.map((p) => ({ kind: 'cash' as const, period: p.period, predicted: p.predicted, low: p.low, high: p.high, method: p.method, rationale: p.rationale })));
  }

  if (toSave.length === 0) return;
  await db.transaction((tx) => saveForecasts(tx, toSave, SYSTEM_ACTOR));
}

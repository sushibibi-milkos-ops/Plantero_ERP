import 'server-only';
import { eq } from 'drizzle-orm';
import { db, bankAccounts } from '@plantero/db';
import { sum, toDb, loadSalesHistory, loadCashHistory, listForecastChannels, getLatestForecasts, type ForecastRow } from '@plantero/core';

export type ForecastPageData = {
  salesHistory: { period: string; amount: string }[];
  cashHistory: { period: string; amount: string }[];
  channels: { id: string; code: string; name: string }[];
  salesForecast: ForecastRow[];
  channelForecast: ForecastRow[];
  cashForecast: ForecastRow[];
  /**
   * Güncel banka bakiyesi toplamı (aktif hesaplar) — kriter 6 kök neden düzeltmesi (finans-tahmin-15):
   * `forecasts(kind='cash').predicted` KÜMÜLATİF dönem sonu bakiye tahminidir (bkz. `packages/ai/src/
   * forecast.ts` `balance = balance.plus(inflow).minus(outflow)`), oysa grafikteki "Gerçekleşen" serisi
   * (`cashHistory`) AYLIK net nakit akışıdır — aynı eksende iki farklı birim. Bu değer, kümülatif
   * tahmini görüntüleme katmanında (forecast-panel.tsx) aylık delta'ya çevirmenin başlangıç noktası
   * (ilk tahmin ayının bir önceki bakiyesi) olarak kullanılır; `forecasts` tablosuna yazılmaz, yalnızca
   * ekranda tek-birim grafik üretmek için taze okunur.
   */
  currentBankBalance: string;
};

export async function getForecastPage(): Promise<ForecastPageData> {
  const [salesHistory, cashHistory, channels, salesForecast, channelForecast, cashForecast, accounts] = await Promise.all([
    loadSalesHistory(db, { months: 12 }),
    loadCashHistory(db),
    listForecastChannels(db),
    getLatestForecasts(db, 'sales'),
    getLatestForecasts(db, 'channel_sales'),
    getLatestForecasts(db, 'cash'),
    db.select({ balance: bankAccounts.statementBalance }).from(bankAccounts).where(eq(bankAccounts.isActive, true)),
  ]);
  const currentBankBalance = toDb(sum(accounts.map((a) => a.balance)));
  return { salesHistory, cashHistory, channels, salesForecast, channelForecast, cashForecast, currentBankBalance };
}

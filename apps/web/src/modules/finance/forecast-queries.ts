import 'server-only';
import { db } from '@plantero/db';
import { loadSalesHistory, loadCashHistory, listForecastChannels, getLatestForecasts, type ForecastRow } from '@plantero/core';

export type ForecastPageData = {
  salesHistory: { period: string; amount: string }[];
  cashHistory: { period: string; amount: string }[];
  channels: { id: string; code: string; name: string }[];
  salesForecast: ForecastRow[];
  channelForecast: ForecastRow[];
  cashForecast: ForecastRow[];
};

export async function getForecastPage(): Promise<ForecastPageData> {
  const [salesHistory, cashHistory, channels, salesForecast, channelForecast, cashForecast] = await Promise.all([
    loadSalesHistory(db, { months: 12 }),
    loadCashHistory(db),
    listForecastChannels(db),
    getLatestForecasts(db, 'sales'),
    getLatestForecasts(db, 'channel_sales'),
    getLatestForecasts(db, 'cash'),
  ]);
  return { salesHistory, cashHistory, channels, salesForecast, channelForecast, cashForecast };
}

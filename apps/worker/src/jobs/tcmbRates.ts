import { db, exchangeRates } from '@plantero/db';
import { tcmb } from '@plantero/integrations';

/** TCMB kur güncelleme: günlük alım-satım kurlarını `exchange_rates`'e upsert eder. */
export async function runTcmbRates(): Promise<Record<string, unknown>> {
  const today = new Date();
  const dateIso = today.toISOString().slice(0, 10);
  const rates = await tcmb.fetchDaily(today);
  const source = tcmb.mode === 'live' ? 'TCMB' : 'TCMB-SANDBOX';

  let upserted = 0;
  for (const r of rates) {
    await db
      .insert(exchangeRates)
      .values({ currency: r.currency, rateDate: dateIso, buying: r.buying, selling: r.selling, source })
      .onConflictDoUpdate({ target: [exchangeRates.currency, exchangeRates.rateDate], set: { buying: r.buying, selling: r.selling, source, fetchedAt: new Date() } });
    upserted++;
  }

  return { mode: tcmb.mode, currencies: rates.map((r) => r.currency), upserted };
}

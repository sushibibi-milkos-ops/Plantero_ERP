import { D, toDbRate } from '@plantero/core';
import { isoDate, seededRandom } from '../lib/prng.js';
import type { DailyRate, IntegrationMode, RateProvider } from '../types.js';

/**
 * TCMB döviz kuru adaptörü.
 * `TCMB_LIVE=1` set edilmemişse (env yoksa) sandbox: sabit kur tablosu + gün bazlı
 * küçük deterministik sapma (±%1). Canlı modda `tcmb.gov.tr/kurlar/today.xml` çekilir.
 */

const computeMode = (): IntegrationMode => (process.env.TCMB_LIVE === '1' || process.env.TCMB_LIVE === 'true' ? 'live' : 'sandbox');

const SANDBOX_BASE_RATES: Record<string, { buying: number; selling: number }> = {
  USD: { buying: 34.1, selling: 34.25 },
  EUR: { buying: 37.2, selling: 37.4 },
  GBP: { buying: 43.5, selling: 43.8 },
};

function sandboxFetchDaily(date: Date): DailyRate[] {
  const rnd = seededRandom(`tcmb-${isoDate(date)}`);
  return Object.entries(SANDBOX_BASE_RATES).map(([currency, base]) => {
    const variance = 1 + (rnd() - 0.5) * 0.02; // ±%1 günlük sapma
    const buying = D(base.buying).mul(variance);
    const spreadRatio = D(base.selling).div(base.buying);
    const selling = buying.mul(spreadRatio);
    return { currency, buying: toDbRate(buying), selling: toDbRate(selling) };
  });
}

function normalizeDecimal(s: string): string {
  return s.trim().replace(',', '.');
}

/** TCMB `kurlar/today.xml` gövdesini çözümler; birim > 1 olan para birimlerinde (JPY vb.) orana böler */
export function parseTcmbXml(xml: string): DailyRate[] {
  const blocks = xml.match(/<Currency\b[^>]*>[\s\S]*?<\/Currency>/g) ?? [];
  const rates: DailyRate[] = [];

  for (const block of blocks) {
    const kodMatch = /Kod="([A-Z]{3})"/.exec(block);
    const unitMatch = /<Unit>\s*([\d.,]+)\s*<\/Unit>/.exec(block);
    const buyMatch = /<ForexBuying>\s*([\d.,]*)\s*<\/ForexBuying>/.exec(block);
    const sellMatch = /<ForexSelling>\s*([\d.,]*)\s*<\/ForexSelling>/.exec(block);
    if (!kodMatch || !buyMatch?.[1] || !sellMatch?.[1]) continue; // bazı para birimlerinde Forex alanı boş olabilir

    const unit = D(normalizeDecimal(unitMatch?.[1] ?? '1'));
    const divisor = unit.isZero() ? D(1) : unit;
    const buying = D(normalizeDecimal(buyMatch[1])).div(divisor);
    const selling = D(normalizeDecimal(sellMatch[1])).div(divisor);
    rates.push({ currency: kodMatch[1]!, buying: toDbRate(buying), selling: toDbRate(selling) });
  }

  return rates;
}

function yyyymm(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function ddmmyyyy(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`;
}

async function liveFetchDaily(date: Date): Promise<DailyRate[]> {
  const isToday = isoDate(date) === isoDate(new Date());
  const url = isToday ? 'https://www.tcmb.gov.tr/kurlar/today.xml' : `https://www.tcmb.gov.tr/kurlar/${yyyymm(date)}/${ddmmyyyy(date)}.xml`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TCMB kur alınamadı: HTTP ${res.status}`);
  const xml = await res.text();
  return parseTcmbXml(xml);
}

export const tcmb: RateProvider = {
  get mode() {
    return computeMode();
  },
  fetchDaily: (date) => (computeMode() === 'sandbox' ? Promise.resolve(sandboxFetchDaily(date)) : liveFetchDaily(date)),
};

import { and, eq, gte, lte, isNotNull } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { workOrders, downtimes, productionLines, type DbOrTx } from '@plantero/db';
import { D, round2, round4, ZERO, sum } from '../money.js';
import { businessDate } from '../dates.js';

/** Verim % = üretilen / planlanan × 100 (2 hane). Planlanan sıfırsa 0. */
export function computeYieldPct(plannedQty: Decimal, producedQty: Decimal): Decimal {
  if (plannedQty.lte(0)) return ZERO;
  return round2(producedQty.div(plannedQty).mul(100));
}

export type LineDayOee = { availabilityPct: Decimal; performancePct: Decimal; qualityPct: Decimal; oeePct: Decimal; plannedMinutes: number; downtimeMinutes: number; runMinutes: number; idealOutput: Decimal; actualOutput: Decimal; goodOutput: Decimal };

/**
 * Bir hattın belirli gündeki OEE'sini o günün iş emri/duruş kayıtlarından canlı hesaplar
 * (kalıcı `oee_records` kaydı `oee-daily` worker'ının işi — burada yalnızca ekran için türetilir).
 * Kullanılabilirlik = (planlanan − duruş) / planlanan; Performans = ideal üretim süresi / çalışma süresi
 * (capacityPerHour ile); Kalite = (üretilen − fire) / üretilen.
 */
export async function computeLineOeeForDay(tx: DbOrTx, lineId: string, day: string): Promise<LineDayOee> {
  const [line] = await tx.select().from(productionLines).where(eq(productionLines.id, lineId)).limit(1);
  const plannedMinutes = line?.shiftMinutes ?? 480;

  const dayDowntimes = await tx.select({ minutes: downtimes.minutes }).from(downtimes).where(and(eq(downtimes.lineId, lineId), gte(downtimes.startedAt, new Date(`${day}T00:00:00Z`)), lte(downtimes.startedAt, new Date(`${day}T23:59:59Z`))));
  const downtimeMinutes = dayDowntimes.reduce((a, d) => a + (d.minutes ?? 0), 0);
  const runMinutes = Math.max(0, plannedMinutes - downtimeMinutes);

  const wos = await tx.select().from(workOrders).where(and(eq(workOrders.lineId, lineId), isNotNull(workOrders.finishedAt)));
  const dayWos = wos.filter((w) => w.finishedAt && businessDate(w.finishedAt) === day);
  const actualOutput = sum(dayWos.map((w) => w.producedQty));
  const scrapOutput = sum(dayWos.map((w) => w.scrapQty));
  const goodOutput = Decimal.max(ZERO, actualOutput.minus(scrapOutput));
  const idealOutput = line?.capacityPerHour ? round4(D(line.capacityPerHour).mul(runMinutes).div(60)) : ZERO;

  const availabilityPct = plannedMinutes > 0 ? round2(D(runMinutes).div(plannedMinutes).mul(100)) : ZERO;
  const performancePct = idealOutput.gt(0) ? Decimal.min(D(100), round2(actualOutput.div(idealOutput).mul(100))) : ZERO;
  const qualityPct = actualOutput.gt(0) ? round2(goodOutput.div(actualOutput).mul(100)) : ZERO;
  const oeePct = round2(availabilityPct.mul(performancePct).mul(qualityPct).div(10000));

  return { availabilityPct, performancePct, qualityPct, oeePct, plannedMinutes, downtimeMinutes, runMinutes, idealOutput, actualOutput, goodOutput };
}

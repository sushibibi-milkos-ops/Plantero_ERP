import { and, eq, isNull } from 'drizzle-orm';
import { oeeRecords, productionLines, type DbOrTx } from '@plantero/db';
import { toDb } from '../money.js';
import { addDays } from '../dates.js';
import { computeLineOeeForDay } from '../production/yield.js';

/**
 * Günlük OEE kalıcılaştırma — docs/modules/bakim.md §4.
 * Hesap mantığının KENDİSİ `production/yield.ts::computeLineOeeForDay` içinde zaten var (üretim
 * modülü `/uretim/hatlar`'da GÜNÜN OEE'sini canlı göstermek için yazmıştı — aynı formül burada
 * TEKRAR YAZILMAZ, yalnızca sarmalanıp `oee_records`'a yazılır). Bu modülün eklediği şey: geçmiş
 * günler için KALICI kayıt (trend grafiği + duruş pareto'su geriye dönük sorgulanabilsin diye) —
 * `computeLineOeeForDay` her çağrıldığında o günün ham verisinden yeniden hesaplar, burada sadece
 * worker `oee-daily` (23:30) ve seed'in çağırdığı "hesapla ve sakla" katmanı eklenir.
 *
 * Not: `oee_records_uq` (line_id, machine_id, day) benzersiz indeksi `machine_id` NULL olduğunda
 * Postgres'in "her NULL birbirinden farklıdır" kuralı yüzünden `ON CONFLICT` ile güvenilir çalışmaz
 * (iki NULL asla çakışma saymaz) — bu yüzden upsert burada elle select→update/insert ile yapılır.
 * Makine bazlı satır (`machineId` dolu) şu an üretilmiyor: `work_orders` yalnızca hatla ilişkilidir,
 * belirli bir makineyle değil — bilinen kapsam sınırı (rapora yazıldı).
 */

async function upsertOeeRecord(tx: DbOrTx, lineId: string, day: string, values: Omit<typeof oeeRecords.$inferInsert, 'lineId' | 'machineId' | 'day'>): Promise<string> {
  const [existing] = await tx.select({ id: oeeRecords.id }).from(oeeRecords).where(and(eq(oeeRecords.lineId, lineId), isNull(oeeRecords.machineId), eq(oeeRecords.day, day))).limit(1);
  if (existing) {
    await tx.update(oeeRecords).set({ ...values, computedAt: new Date() }).where(eq(oeeRecords.id, existing.id));
    return existing.id;
  }
  const [row] = await tx.insert(oeeRecords).values({ lineId, machineId: null, day, ...values }).returning({ id: oeeRecords.id });
  return row!.id;
}

export type OeeDayRecord = { lineId: string; lineCode: string; day: string; oeePct: string; availabilityPct: string; performancePct: string; qualityPct: string };

/** Aktif her hat için o günün OEE'sini hesaplayıp `oee_records`'a yazar. */
export async function recomputeOeeForDay(tx: DbOrTx, day: string): Promise<OeeDayRecord[]> {
  const lines = await tx.select().from(productionLines).where(eq(productionLines.isActive, true));
  const results: OeeDayRecord[] = [];
  for (const line of lines) {
    const oee = await computeLineOeeForDay(tx, line.id, day);
    await upsertOeeRecord(tx, line.id, day, {
      plannedMinutes: oee.plannedMinutes, downtimeMinutes: oee.downtimeMinutes, runMinutes: oee.runMinutes,
      idealOutput: toDb(oee.idealOutput), actualOutput: toDb(oee.actualOutput), goodOutput: toDb(oee.goodOutput),
      availabilityPct: toDb(oee.availabilityPct), performancePct: toDb(oee.performancePct), qualityPct: toDb(oee.qualityPct), oeePct: toDb(oee.oeePct),
    });
    results.push({ lineId: line.id, lineCode: line.code, day, oeePct: toDb(oee.oeePct), availabilityPct: toDb(oee.availabilityPct), performancePct: toDb(oee.performancePct), qualityPct: toDb(oee.qualityPct) });
  }
  return results;
}

/** Geriye dönük toplu hesap — seed ve elle yeniden hesaplama için (`fromDay`..`toDay` dahil). */
export async function recomputeOeeForRange(tx: DbOrTx, fromDay: string, toDay: string): Promise<number> {
  let day = fromDay;
  let count = 0;
  while (day <= toDay) {
    const rows = await recomputeOeeForDay(tx, day);
    count += rows.length;
    day = addDays(day, 1);
  }
  return count;
}

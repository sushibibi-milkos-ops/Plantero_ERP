import { and, eq, sql } from 'drizzle-orm';
import { sequences, type DbOrTx } from '@plantero/db';

/**
 * Belge numarası dizileri: `${prefix}-${yıl}-${sıra}` (ör. SO-2026-000123).
 * Satır `SELECT ... FOR UPDATE` ile kilitlenir; aynı transaction'daki paralel çağrılar sıralanır.
 */
export const DOC_PREFIXES: Record<string, string> = {
  QT: 'QT', SO: 'SO', DN: 'DN', INV: 'INV', PINV: 'PINV', PAY: 'PAY', GR: 'GR', PO: 'PO', WO: 'WO',
  TR: 'TR', CNT: 'CNT', SCR: 'SCR', SM: 'SM', JE: 'JE', QC: 'QC', RC: 'RC', OPP: 'OPP', EXP: 'EXP',
  MO: 'MO', RD: 'RD',
};

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * Diziden bir sonraki sayıyı atomik olarak alır. Satır yoksa oluşturur.
 * @returns { n, prefix, padding }
 */
export async function nextSequence(
  tx: DbOrTx,
  opts: { code: string; year: number; prefix: string; padding?: number },
): Promise<{ n: number; prefix: string; padding: number }> {
  const { code, year, prefix } = opts;
  const padding = opts.padding ?? 6;

  const lock = () =>
    tx.select().from(sequences).where(and(eq(sequences.code, code), eq(sequences.year, year))).for('update');

  let [row] = await lock();
  if (!row) {
    // Yarış durumunda ikinci ekleyen çakışır; DO NOTHING sonrası tekrar kilitle
    await tx
      .insert(sequences)
      .values({ code, prefix, year, next: 1, padding })
      .onConflictDoNothing({ target: [sequences.code, sequences.year] });
    [row] = await lock();
  }
  if (!row) throw new Error(`Dizi satırı oluşturulamadı: ${code}/${year}`);

  const n = row.next;
  await tx.update(sequences).set({ next: sql`${sequences.next} + 1` }).where(eq(sequences.id, row.id));
  return { n, prefix: row.prefix, padding: row.padding };
}

/** `SO` → `SO-2026-000001`. Bilinmeyen kod için prefix = kod. */
export async function nextDocNo(tx: DbOrTx, code: string, date: Date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const prefix = DOC_PREFIXES[code] ?? code;
  const { n, prefix: p, padding } = await nextSequence(tx, { code, year, prefix, padding: 6 });
  return `${p}-${year}-${pad(n, padding)}`;
}

/** `HAT1` → `H1` (lot numarası için kısa hat kodu); diğer kodlar olduğu gibi kalır */
export const shortLineCode = (lineCode: string): string => lineCode.replace(/^HAT(\d+)$/i, 'H$1').toUpperCase();

const yymmdd = (d: Date) =>
  `${pad(d.getUTCFullYear() % 100, 2)}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;

/**
 * Mamul lot numarası: `PL-YYMMDD-<HAT>-<sıra2>` (ör. PL-260902-H1-01).
 * Dizi kodu gün + hat bazındadır; sıra 99'u aşarsa 3 haneye taşar.
 */
export async function nextLotNo(tx: DbOrTx, lineCode: string, date: Date = new Date()): Promise<string> {
  const day = yymmdd(date);
  const line = shortLineCode(lineCode);
  const prefix = `PL-${day}-${line}`;
  const { n } = await nextSequence(tx, { code: `LOT-${line}-${day}`, year: date.getUTCFullYear(), prefix, padding: 2 });
  return `${prefix}-${pad(n, 2)}`;
}

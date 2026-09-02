import { describe, it, expect, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, sequences } from '@plantero/db';
import { nextDocNo, nextLotNo, shortLineCode } from '../sequences.js';
import { suffix, withRollback } from './helpers.js';

const codes: string[] = [];

afterAll(async () => {
  if (codes.length) await db.delete(sequences).where(inArray(sequences.code, codes));
});

describe('sequences', () => {
  it('nextDocNo biçimi: PREFIX-YIL-000001 ve artan', async () => {
    await withRollback(async (tx) => {
      const y = new Date().getUTCFullYear();
      const a = await nextDocNo(tx, 'SO');
      const b = await nextDocNo(tx, 'SO');
      expect(a).toMatch(new RegExp(`^SO-${y}-\\d{6}$`));
      const na = Number(a.split('-')[2]);
      const nb = Number(b.split('-')[2]);
      expect(nb).toBe(na + 1);
    });
  });

  it('paralel 20 çağrı benzersiz numara üretir (FOR UPDATE)', async () => {
    const code = `T${suffix()}`;
    codes.push(code);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => db.transaction((tx) => nextDocNo(tx, code))),
    );
    expect(new Set(results).size).toBe(20);
    const nums = results.map((r) => Number(r.split('-')[2])).sort((a, b) => a - b);
    expect(nums[0]).toBe(1);
    expect(nums[19]).toBe(20);
    const [row] = await db.select().from(sequences).where(eq(sequences.code, code));
    expect(row?.next).toBe(21);
  });

  it('nextLotNo: PL-YYMMDD-HAT-SIRA', async () => {
    await withRollback(async (tx) => {
      const date = new Date(Date.UTC(2026, 8, 2));
      const a = await nextLotNo(tx, 'HAT1', date);
      const b = await nextLotNo(tx, 'HAT1', date);
      expect(a).toMatch(/^PL-260902-H1-\d{2}$/);
      expect(Number(b.slice(-2))).toBe(Number(a.slice(-2)) + 1);
      expect(shortLineCode('HAT4')).toBe('H4');
      expect(shortLineCode('KX')).toBe('KX');
    });
  });
});

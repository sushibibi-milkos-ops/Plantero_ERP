import { describe, it, expect } from 'vitest';
import { D, toDb, round2, round4, sum, pct, ZERO, isZero4, netFromGross, formatQtyTr } from '../money.js';

describe('money', () => {
  it('D: null/undefined → 0, string → Decimal', () => {
    expect(D(null).eq(0)).toBe(true);
    expect(D(undefined).eq(0)).toBe(true);
    expect(D('12.3456').toFixed(4)).toBe('12.3456');
  });
  it('toDb her zaman 4 hane', () => {
    expect(toDb(D('1'))).toBe('1.0000');
    expect(toDb(D('0.1').plus('0.2'))).toBe('0.3000');
    expect(toDb(D('2.00005'))).toBe('2.0001');
  });
  it('round2 / round4 yarım yukarı', () => {
    expect(round2(D('1.005')).toString()).toBe('1.01');
    expect(round4(D('1.00005')).toString()).toBe('1.0001');
  });
  it('sum ve pct', () => {
    expect(sum([D('1.1'), '2.2', 3]).toFixed(4)).toBe('6.3000');
    expect(pct(D('1000'), 1).toFixed(4)).toBe('10.0000');
    expect(pct(D('1000'), '20').toFixed(4)).toBe('200.0000');
  });
  it('float hatası yok', () => {
    expect(D('0.1').plus('0.2').eq('0.3')).toBe(true);
    expect(isZero4(D('0.00004'))).toBe(true);
    expect(isZero4(D('0.00005'))).toBe(false);
    expect(ZERO.isZero()).toBe(true);
  });
  it('KDV dahilden net', () => {
    expect(round2(netFromGross(D('120'), 20)).toString()).toBe('100');
  });
  it('formatQtyTr: ham numeric(18,4) string yerine TR biçimli, gereksiz sıfırsız (tur 1 P1 core-trace/recall)', () => {
    expect(formatQtyTr('19.0000')).toBe('19');
    expect(formatQtyTr('38.0000')).toBe('38');
    expect(formatQtyTr(D('1250.5000'))).toBe('1.250,5');
    expect(formatQtyTr('0.0000')).toBe('0');
    expect(formatQtyTr('12.3400')).toBe('12,34');
  });
});

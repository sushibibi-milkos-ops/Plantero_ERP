import { describe, it, expect } from 'vitest';
import { D } from '../money.js';
import { checkEtgbLimit, resolveRegime, ETGB_MAX_NET_WEIGHT_KG, ETGB_MAX_VALUE_EUR } from './etgb.js';

describe('export/etgb — ETGB (mikro ihracat) limit kontrolü', () => {
  it('limit altında: kolay usul (ETGB) uygun', () => {
    const check = checkEtgbLimit({ netWeightKg: D(250), amountEur: D(12000) });
    expect(check.withinLimit).toBe(true);
    expect(check.reasons).toHaveLength(0);
    expect(resolveRegime('etgb', check)).toBe('etgb');
  });

  it('ağırlık limiti aşılırsa standart rejime düşer', () => {
    const check = checkEtgbLimit({ netWeightKg: ETGB_MAX_NET_WEIGHT_KG.plus(1), amountEur: D(1000) });
    expect(check.withinLimit).toBe(false);
    expect(check.reasons[0]).toMatch(/Net ağırlık/);
    expect(resolveRegime('etgb', check)).toBe('standard');
  });

  it('tutar limiti aşılırsa standart rejime düşer', () => {
    const check = checkEtgbLimit({ netWeightKg: D(10), amountEur: ETGB_MAX_VALUE_EUR.plus(1) });
    expect(check.withinLimit).toBe(false);
    expect(check.reasons[0]).toMatch(/Tutar/);
    expect(resolveRegime('etgb', check)).toBe('standard');
  });

  it('her iki limit de aşılırsa iki gerekçe de listelenir', () => {
    const check = checkEtgbLimit({ netWeightKg: D(500), amountEur: D(20000) });
    expect(check.reasons).toHaveLength(2);
  });

  it('zaten standart istenmişse limit durumundan bağımsız standart kalır', () => {
    const check = checkEtgbLimit({ netWeightKg: D(1), amountEur: D(1) });
    expect(resolveRegime('standard', check)).toBe('standard');
  });

  it('değer verilmemişse (henüz bilinmiyor) o boyut limit ihlali saymaz', () => {
    const check = checkEtgbLimit({ netWeightKg: null, amountEur: null });
    expect(check.withinLimit).toBe(true);
    expect(check.netWeightKg).toBeNull();
    expect(check.amountEur).toBeNull();
  });
});

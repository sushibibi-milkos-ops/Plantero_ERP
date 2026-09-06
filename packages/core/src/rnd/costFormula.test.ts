import { describe, it, expect } from 'vitest';
import { d } from '../__tests__/helpers.js';
import { computeTrialCost } from './costFormula.js';

describe('rnd/costFormula — computeTrialCost (saf formül, DB bağımlılığı yok)', () => {
  it('Σ miktar×(1+fire%)×maliyet ÷ (parti×verim%) + genel gider', () => {
    // 2 satır: 10 kg × ₺5 (fire yok) + 1 kg × ₺20 (%10 fire) = 50 + 22 = 72
    // parti 10 kg, verim %90 → etkin çıktı 9 kg; genel gider parti 18, birim 2
    // birim maliyet = (72 + 18) / 9 + 2 = 10 + 2 = 12
    const res = computeTrialCost({
      batchQty: d('10'),
      expectedYieldPct: d('90'),
      overheadPerBatch: d('18'),
      overheadPerUnit: d('2'),
      lines: [
        { qty: d('10'), unitCost: d('5'), scrapPct: d('0') },
        { qty: d('1'), unitCost: d('20'), scrapPct: d('10') },
      ],
    });
    expect(res.materialCost.toFixed(4)).toBe('72.0000');
    expect(res.effectiveOutputQty.toFixed(4)).toBe('9.0000');
    expect(res.unitCost.toFixed(4)).toBe('12.0000');
  });

  it('byproduct/fire olmayan tek satırda birim maliyet = maliyet (verim %100, genel gider 0)', () => {
    const res = computeTrialCost({
      batchQty: d('10'), expectedYieldPct: d('100'), overheadPerBatch: d('0'), overheadPerUnit: d('0'),
      lines: [{ qty: d('10'), unitCost: d('4'), scrapPct: d('0') }],
    });
    expect(res.unitCost.toFixed(4)).toBe('4.0000');
  });

  it('verim %0 iken sıfıra bölme yerine parti miktarını kullanır (asla NaN/Infinity üretmez)', () => {
    const res = computeTrialCost({
      batchQty: d('5'), expectedYieldPct: d('0'), overheadPerBatch: d('0'), overheadPerUnit: d('0'),
      lines: [{ qty: d('5'), unitCost: d('2'), scrapPct: d('0') }],
    });
    expect(res.unitCost.isFinite()).toBe(true);
  });

  it('satır sayısı 0 iken materialCost 0, unitCost yalnızca genel giderden oluşur', () => {
    const res = computeTrialCost({ batchQty: d('10'), expectedYieldPct: d('100'), overheadPerBatch: d('50'), overheadPerUnit: d('1'), lines: [] });
    expect(res.materialCost.toFixed(4)).toBe('0.0000');
    expect(res.unitCost.toFixed(4)).toBe('6.0000'); // 50/10 + 1
  });
});

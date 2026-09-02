import { describe, expect, it } from 'vitest';
import { trendyol } from '../marketplace/trendyol.js';
import { hepsiburada } from '../marketplace/hepsiburada.js';

describe('marketplace sandbox (trendyol/hepsiburada)', () => {
  it('env yoksa sandbox moddadır', () => {
    expect(trendyol.mode).toBe('sandbox');
    expect(hepsiburada.mode).toBe('sandbox');
  });

  it('günde 5-15 sipariş üretir ve seed ürün barkodlarını kullanır', async () => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 1);
    since.setUTCHours(0, 0, 0, 0);

    const orders = await trendyol.fetchOrders(since);
    expect(orders.length).toBeGreaterThanOrEqual(5);
    expect(orders.length).toBeLessThanOrEqual(30); // 2 gün (dün + bugün) × 5-15

    for (const o of orders) {
      expect(o.lines.length).toBeGreaterThan(0);
      for (const line of o.lines) {
        expect(line.barcode).toBeTruthy();
        expect(Number(line.qty)).toBeGreaterThan(0);
        expect(Number(line.unitPrice)).toBeGreaterThan(0);
      }
      expect(Number(o.grossAmount)).toBeGreaterThan(0);
      expect(Number(o.netAmount)).toBeLessThanOrEqual(Number(o.grossAmount));
    }
  });

  it('aynı tarih aralığı için deterministik (idempotent) sonuç üretir', async () => {
    const since = new Date('2026-08-01T00:00:00Z');
    // Küçük ufuk ile hızlı ve tekrarlanabilir kıyaslama
    const a = await hepsiburada.fetchOrders(since);
    const b = await hepsiburada.fetchOrders(since);
    expect(a.map((o) => o.externalId)).toEqual(b.map((o) => o.externalId));
    expect(a[0]?.grossAmount).toBe(b[0]?.grossAmount);
  }, 20_000);

  it('updateStock sandboxta gerçek API çağırmadan başarı döner', async () => {
    const res = await trendyol.updateStock([{ barcode: '1234567890123', qty: '10' }]);
    expect(res).toEqual({ ok: true, updated: 1, sandbox: true });
  });

  it('fetchSettlements sandboxta tutarlı bir hakediş satırı döner', async () => {
    const res = await hepsiburada.fetchSettlements({ periodStart: '2026-08-01', periodEnd: '2026-08-31' });
    expect(res).toHaveLength(1);
    const s = res[0]!;
    expect(Number(s.netPayout)).toBeLessThan(Number(s.grossSales));
    expect(Number(s.commissions)).toBeGreaterThan(0);
  });
});

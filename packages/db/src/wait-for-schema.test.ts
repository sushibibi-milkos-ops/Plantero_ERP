import { describe, it, expect } from 'vitest';
import { collectExpectedTableNames, MIN_EXPECTED_TABLES } from './wait-for-schema.js';

/**
 * Regresyon testi — round 18 P1: `wait-for-schema.ts` artık 4 elle seçilmiş sentinel tablo yerine
 * Drizzle şemasındaki (`schema/index.ts`'in re-export ettiği TÜM dosyalar) HER `pgTable`'ı
 * programatik olarak topluyor. Bu test, o toplama mantığının schema import'unu doğru okuduğunu ve
 * geç/FK-ağır bir tabloyu (`work_orders` — round 18'de görülen gerçek hatanın kaynağı) kaçırmadığını kilitler.
 */
describe('wait-for-schema — collectExpectedTableNames', () => {
  it(`şemadaki tüm tabloları toplar (>= ${MIN_EXPECTED_TABLES})`, () => {
    const tables = collectExpectedTableNames();
    expect(tables.length).toBeGreaterThanOrEqual(MIN_EXPECTED_TABLES);
    // Tekilleştirilmiş ve sıralı olmalı (sql `unnest` sorgusuna güvenli şekilde geçilir).
    expect(new Set(tables).size).toBe(tables.length);
    expect(tables).toEqual([...tables].sort());
  });

  it('geç/FK-ağır tabloları (round 18’de hataya yol açan sınıf) kapsar — sadece eski 4 erken sentinel değil', () => {
    const tables = collectExpectedTableNames();
    // Eski sentinel seti (roles/permissions/sequences/users) hâlâ dahil olmalı...
    expect(tables).toEqual(expect.arrayContaining(['roles', 'permissions', 'sequences', 'users']));
    // ...ama artık production seed adımının patladığı geç tablo da (ve onun gibi diğerleri de) kapsanmalı.
    expect(tables).toEqual(
      expect.arrayContaining([
        'work_orders',
        'work_order_consumptions',
        'work_order_outputs',
        'stock_lots',
        'stock_moves',
        'journal_entries',
        'export_shipments',
      ]),
    );
  });
});

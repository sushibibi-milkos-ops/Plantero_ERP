import { db, sql, type DbOrTx } from '../client.js';
import { log, parseOnlyArg, SeedSummary } from './_helpers.js';
import { seedCore } from './core.js';
import { seedUoms } from './uoms.js';
import { seedMasterdata } from './masterdata.js';
import { seedAccounting } from './accounting.js';
import { seedFinance } from './finance.js';
import { seedStock } from './stock.js';
import { seedProduction } from './production.js';
import { seedSales } from './sales.js';
import { seedPurchasing, seedPurchasingBackfill } from './purchasing.js';
import { seedFinancePayments } from './finance-payments.js';

/**
 * Seed sırası — docs/ARCHITECTURE.md §11 genel akışı `... stock → production → sales → purchasing ...`
 * belirtse de, docs/modules/tedarik.md `purchasing`'in `stock`'tan ÖNCE çalışmasını ŞART koşar: `stock`
 * seed'i (6 mal kabul) gerçek `purchase_orders`/`purchase_order_lines`e bağlanmalı (docs/INVARIANTS.md
 * I24 — "PO'suz mal kabul yasak"), bu da PO'ların mal kabullerden önce var olmasını gerektirir. Bu
 * çelişki modül sözleşmesi lehine çözülmüştür (tur 6 P0 düzeltmesi): `purchasing` artık `finance`'ten
 * hemen sonra, `stock`'tan önce çalışır. Ayrıca dizinin EN SONUNA `purchasing-backfill` eklendi: diğer
 * tüm modüllerin (production/sales/...) kendi ürettiği, PO'suz kalabilecek herhangi bir mal kabulü
 * geriye dönük bir siparişe bağlayan güvenlik ağı (idempotent — bkz. `purchasing.ts`
 * `seedPurchasingBackfill`). Yeni bir modül seed'i eklerken (quality/bank/maintenance/rnd) bu son adımın
 * ÖNÜNE eklenmelidir ki kendi ürettiği olası PO'suz mal kabuller de yamanabilsin.
 */
const SEED_STEPS: Array<{ name: string; run: (tx: DbOrTx, summary: SeedSummary) => Promise<void> }> = [
  { name: 'core', run: seedCore },
  { name: 'uoms', run: seedUoms },
  { name: 'masterdata', run: seedMasterdata },
  { name: 'accounting', run: seedAccounting },
  { name: 'finance', run: seedFinance },
  { name: 'purchasing', run: seedPurchasing },
  { name: 'stock', run: seedStock },
  { name: 'production', run: seedProduction },
  { name: 'sales', run: seedSales },
  // `finance-payments`: sales + tüm otomatik-faturalanan mal kabulleri (stock adımı) bittikten sonra —
  // tüm faturalar (satış + alış) burada mevcuttur. `purchasing-backfill`'den ÖNCE: o adım yalnızca
  // PO'suz mal kabulleri yamar, tahsilat/mutabakat verisiyle bağımlılığı yoktur (sıra bu yüzden serbest,
  // ama modül sözleşmesi gereği belge akışının doğal sonunda — bkz. finance-payments.ts başlık yorumu).
  { name: 'finance-payments', run: seedFinancePayments },
  { name: 'purchasing-backfill', run: seedPurchasingBackfill },
];

async function main() {
  const only = parseOnlyArg(process.argv.slice(2));
  const steps = only ? SEED_STEPS.filter((s) => only.includes(s.name)) : SEED_STEPS;
  if (only) {
    const unknown = only.filter((name) => !SEED_STEPS.some((s) => s.name === name));
    if (unknown.length) log('seed', `UYARI: bilinmeyen --only adı(ları) yok sayıldı: ${unknown.join(', ')}`);
  }
  if (steps.length === 0) {
    log('seed', 'çalıştırılacak adım yok — çıkılıyor');
    return;
  }

  log('seed', `başlıyor: ${steps.map((s) => s.name).join(' → ')}`);
  const summary = new SeedSummary();

  for (const step of steps) {
    const startedAt = Date.now();
    log('seed', `── ${step.name} ──`);
    await db.transaction(async (tx) => {
      await step.run(tx, summary);
    });
    log('seed', `${step.name} tamamlandı (${Date.now() - startedAt}ms)`);
  }

  summary.print();
  log('seed', 'tüm adımlar tamamlandı');
}

main()
  .catch((err) => {
    console.error('[seed] HATA:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });

import { db, sql, type DbOrTx } from '../client.js';
import { log, parseOnlyArg, SeedSummary } from './_helpers.js';
import { seedCore } from './core.js';
import { seedUoms } from './uoms.js';
import { seedMasterdata } from './masterdata.js';
import { seedAccounting } from './accounting.js';
import { seedFinance } from './finance.js';
import { seedStock } from './stock.js';

/**
 * Seed sırası — docs/ARCHITECTURE.md §11:
 * core → uoms → masterdata → accounting → finance → stock → production → sales → purchasing
 *   → quality → bank → maintenance → rnd
 *
 * Bu turda ilk 6 adım (core, uoms, masterdata, accounting, finance, stock) uygulanmıştır.
 * Sonraki adımlar ileride modül agent'ları tarafından bu diziye eklenecek — yeni bir seed dosyası
 * yazıp `{ name: '<modul>', run: seedX }` olarak SEED_STEPS'e eklemek yeterlidir.
 */
const SEED_STEPS: Array<{ name: string; run: (tx: DbOrTx, summary: SeedSummary) => Promise<void> }> = [
  { name: 'core', run: seedCore },
  { name: 'uoms', run: seedUoms },
  { name: 'masterdata', run: seedMasterdata },
  { name: 'accounting', run: seedAccounting },
  { name: 'finance', run: seedFinance },
  { name: 'stock', run: seedStock },
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

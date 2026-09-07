import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql, eq } from 'drizzle-orm';
import { db, invoices, type Tx } from '@plantero/db';
import { createCreditNote } from '../packages/core/src/accounting/invoices.js';

const ctx = { userId: null, userEmail: 'veri-critic@plantero.local', requestId: 'vc-r7' };

class Rollback extends Error {}

async function runChecks(tx: Tx): Promise<void> {
  const dir = path.join(process.cwd(), 'packages/db/src/checks');
  const files = (await readdir(dir)).filter((f) => /^\d{2}_.+\.sql$/.test(f)).sort();
  for (const f of files) {
    const text = await readFile(path.join(dir, f), 'utf-8');
    try {
      const rows = await tx.execute(sql.raw(text));
      const arr = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
      if (arr.length > 0) {
        console.log(`--- ${f}: ${arr.length} ihlal ---`);
        console.log(JSON.stringify(arr.slice(0, 5), null, 2));
      }
    } catch (e) {
      console.log(`--- ${f}: HATA ${(e as Error).message} ---`);
    }
  }
}

async function main() {
  try {
    await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.kind, 'sales')).limit(1);
      if (!inv) throw new Error('satış faturası yok');
      console.log('Kaynak fatura:', inv.docNo, inv.status, inv.grandTotal, inv.partnerId);
      const result = await createCreditNote(tx, { invoiceId: inv.id, reason: 'veri-critic tur 7 canlı egzersiz' }, ctx);
      console.log('İade faturası oluşturuldu:', result.invoice.docNo, result.invoice.grandTotal, result.invoice.status);
      console.log('=== db:check (aynı transaction içinde) ===');
      await runChecks(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) {
      console.error('HATA:', e);
    } else {
      console.log('rollback OK — kalıcı veri yok');
    }
  }
  process.exit(0);
}

main();

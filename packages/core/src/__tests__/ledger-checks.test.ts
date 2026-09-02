import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { postStockMove, createLot } from '../stock/ledger.js';
import { withRollback, seedBase, ctx, d, daysFromNow } from './helpers.js';

const REF = '00000000-0000-4000-8000-0000000000ee';
const CHECKS = ['01_inventory_value.sql', '02_stock_ledger.sql', '03_stock_journal_link.sql', '04_journal_balance.sql', '16_lot_status_moves.sql'];

describe('kanıt: yuvarlamalı gerçek hareketler üzerinde I1/I2/I3/I4/I16 SQL 0 ihlal', () => {
  it('çalışır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // lotsuz: 3 @ 10, 1 @ 10.0001, 7 @ 3.3333; çıkış 2.5
      for (const [q, c] of [['3', '10'], ['1', '10.0001'], ['7', '3.3333']]) {
        await postStockMove(tx, { kind: 'receipt', productId: b.pack.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(q!), uomId: b.kg.id, unitCost: d(c!), refType: 'receipt', refId: REF }, ctx);
      }
      await postStockMove(tx, { kind: 'consumption', productId: b.pack.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d('2.5'), uomId: b.kg.id, refType: 'work_order', refId: REF }, ctx);
      await postStockMove(tx, { kind: 'transfer', productId: b.pack.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.hamR02.id, qty: d('4.4444'), uomId: b.kg.id, refType: 'transfer', refId: REF }, ctx);
      // lotlu: 0.9999 @ 1.0001, üç çıkış 0.3333; ikinci lota iki farklı maliyetle giriş, transfer bölünmesi
      const lot = await createLot(tx, { productId: b.raw.id, lotNo: 'PRF-1', origin: 'receipt', status: 'released', expiryDate: daysFromNow(30) }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d('0.9999'), uomId: b.kg.id, unitCost: d('1.0001'), refType: 'receipt', refId: REF }, ctx);
      for (let i = 0; i < 3; i++) await postStockMove(tx, { kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d('0.3333'), uomId: b.kg.id, refType: 'delivery', refId: REF }, ctx);
      const lot2 = await createLot(tx, { productId: b.raw.id, lotNo: 'PRF-2', origin: 'receipt', status: 'released', expiryDate: daysFromNow(30) }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: b.raw.id, lotId: lot2.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d('12.345'), uomId: b.kg.id, unitCost: d('7.7777'), refType: 'receipt', refId: REF }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: b.raw.id, lotId: lot2.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d('0.5555'), uomId: b.kg.id, unitCost: d('9.1234'), refType: 'receipt', refId: REF }, ctx);
      await postStockMove(tx, { kind: 'transfer', productId: b.raw.id, lotId: lot2.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.hamR02.id, qty: d('6.1111'), uomId: b.kg.id, refType: 'transfer', refId: REF }, ctx);
      await postStockMove(tx, { kind: 'scrap', productId: b.raw.id, lotId: lot2.id, fromLocationId: b.loc.hamR02.id, toLocationId: b.loc.scrap.id, qty: d('1.2345'), uomId: b.kg.id, refType: 'scrap', refId: REF }, ctx);
      // WIP'i kapat: 151'deki 14.3940 → 2 adet mamul @ 7.197 (151 sıfırlanır, I1 151 için 0 bekler)
      const fin = await createLot(tx, { productId: b.finished.id, lotNo: 'PL-PRF-01', origin: 'production', productionDate: new Date() }, ctx);
      await postStockMove(tx, { kind: 'production', productId: b.finished.id, lotId: fin.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: d('2'), uomId: b.kg.id, unitCost: d('7.197'), refType: 'work_order', refId: REF }, ctx);
      for (const f of CHECKS) {
        const text = (await readFile(new URL(`../../../db/src/checks/${f}`, import.meta.url), 'utf-8')).replace(/;\s*$/, '');
        const res = await tx.execute(sql.raw(text));
        const rows = Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? [];
        expect(rows, `${f}: ${JSON.stringify(rows).slice(0, 400)}`).toHaveLength(0);
      }
    });
  });
});

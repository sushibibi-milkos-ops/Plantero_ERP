import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { stockQuants, stockLots, stockMoves, journalEntries, journalLines, products } from '@plantero/db';
import { postStockMove, createLot, pickFefo, reserve, release, getOnHand } from '../stock/ledger.js';
import { getAccountBalance, postJournalEntry } from '../accounting/journal.js';
import { type DomainError } from '../auth/errors.js';
import { withRollback, expectReject, seedBase, ctx, d, daysFromNow, type Base } from './helpers.js';
import { D } from '../money.js';
import { fefoDates } from '../stock/ledger.js';
import { addDays } from '../dates.js';
import type { Tx } from '@plantero/db';

const REF = '00000000-0000-4000-8000-000000000001';

async function receiveRaw(tx: Tx, b: Base, lotNo: string, qty: string, unitCost: string, opts: { expiryDate?: string; toLocationId?: string; status?: 'quarantine' | 'released' } = {}) {
  const lot = await createLot(tx, { productId: b.raw.id, lotNo, origin: 'receipt', supplierId: b.supplier.id, expiryDate: opts.expiryDate ?? null, status: opts.status }, ctx);
  const res = await postStockMove(tx, {
    kind: 'receipt', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.sup.id, toLocationId: opts.toLocationId ?? b.loc.kar.id,
    qty: d(qty), uomId: b.kg.id, unitCost: d(unitCost), refType: 'receipt', refId: REF, refNo: 'GR-TEST', partnerId: b.supplier.id,
  }, ctx);
  return { lot, res };
}

async function quant(tx: Tx, productId: string, locationId: string, lotId: string | null) {
  const [q] = await tx.select().from(stockQuants).where(and(eq(stockQuants.productId, productId), eq(stockQuants.locationId, locationId), lotId ? eq(stockQuants.lotId, lotId) : eq(stockQuants.productId, productId)));
  return q ?? null;
}

describe('stock ledger', () => {
  it('receipt → quant + lot maliyeti + 150/320.999 fişi iki defterde', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot, res } = await receiveRaw(tx, b, 'SUP-L1', '100', '12.5');
      expect(res.value.toFixed(4)).toBe('1250.0000');
      expect(res.journalEntryIds).toHaveLength(2);
      expect(res.moveNo).toMatch(/^SM-\d{4}-\d{6}$/);

      const q = await quant(tx, b.raw.id, b.loc.kar.id, lot.id);
      expect(q?.qty).toBe('100.0000');
      expect(q?.reservedQty).toBe('0.0000');

      const [lotRow] = await tx.select().from(stockLots).where(eq(stockLots.id, lot.id));
      expect(lotRow!.unitCost).toBe('12.5000');
      expect(lotRow!.initialQty).toBe('100.0000');
      expect(lotRow!.status).toBe('quarantine'); // requiresIncomingQc
      expect(lotRow!.originReceiptId).toBe(REF);
      expect(lotRow!.expiryDate).toBeTruthy(); // shelfLife 365'ten
      expect(lotRow!.alertDate).toBeTruthy();

      const [move] = await tx.select().from(stockMoves).where(eq(stockMoves.id, res.moveId));
      expect(move!.value).toBe('1250.0000');
      expect(move!.unitCost).toBe('12.5000');
      expect(move!.isValued).toBe(true);
      expect(move!.journalEntryId).toBe(res.journalEntryIds[0]);

      const entries = await tx.select().from(journalEntries).where(eq(journalEntries.refId, res.moveId));
      expect(entries.map((e) => e.ledger).sort()).toEqual(['UFRS', 'VUK']);
      for (const e of entries) {
        const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, e.id));
        const l150 = lines.find((l) => l.accountCode === '150');
        const l320 = lines.find((l) => l.accountCode === '320.999');
        expect(l150?.debit).toBe('1250.0000');
        expect(l320?.credit).toBe('1250.0000');
        expect(e.refType).toBe('stock_move');
      }
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('1250.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'UFRS' })).toFixed(4)).toBe('1250.0000');
      expect((await getAccountBalance(tx, { accountCode: '320.999', ledger: 'VUK' })).toFixed(4)).toBe('-1250.0000');

      const oh = await getOnHand(tx, { productId: b.raw.id });
      expect(oh.qty.toFixed(4)).toBe('100.0000');
      expect(oh.value.toFixed(4)).toBe('1250.0000');
    });
  });

  it('lotlu üründe lotsuz hareket reddedilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const err = await expectReject(tx, (sp) => postStockMove(sp, {
        kind: 'receipt', productId: b.raw.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.kar.id, qty: d(1), uomId: b.kg.id, unitCost: d(1), refType: 'receipt', refId: REF,
      }, ctx));
      expect((err as DomainError).code).toBe('LOT_REQUIRED');
    });
  });

  it('karantina lot müşteriye çıkamaz ve üretime giremez; serbest bırakılınca çıkar', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRaw(tx, b, 'SUP-L2', '50', '10');
      const e1 = await expectReject(tx, (sp) => postStockMove(sp, {
        kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.kar.id, toLocationId: b.loc.cust.id, qty: d(10), uomId: b.kg.id, refType: 'delivery', refId: REF,
      }, ctx));
      expect((e1 as DomainError).code).toBe('LOT_NOT_RELEASED');
      const e2 = await expectReject(tx, (sp) => postStockMove(sp, {
        kind: 'consumption', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.kar.id, toLocationId: b.loc.prod.id, qty: d(10), uomId: b.kg.id, refType: 'work_order', refId: REF,
      }, ctx));
      expect((e2 as DomainError).code).toBe('LOT_NOT_RELEASED');
      // Karantinadan ham depoya doğrudan transfer de yasak
      const e3 = await expectReject(tx, (sp) => postStockMove(sp, {
        kind: 'transfer', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.kar.id, toLocationId: b.loc.hamR01.id, qty: d(10), uomId: b.kg.id, refType: 'transfer', refId: REF,
      }, ctx));
      expect((e3 as DomainError).code).toBe('LOT_IN_QUARANTINE');

      // Serbest bırakma: değersiz hareket, lot released
      const rel = await postStockMove(tx, {
        kind: 'quarantine_release', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.kar.id, toLocationId: b.loc.hamR01.id, qty: d(50), uomId: b.kg.id, refType: 'quality_check', refId: REF,
      }, ctx);
      expect(rel.journalEntryIds).toHaveLength(0);
      const [lotRow] = await tx.select().from(stockLots).where(eq(stockLots.id, lot.id));
      expect(lotRow!.status).toBe('released');
      expect(lotRow!.releasedAt).toBeTruthy();
      expect((await quant(tx, b.raw.id, b.loc.kar.id, lot.id))?.qty).toBe('0.0000');
      expect((await quant(tx, b.raw.id, b.loc.hamR01.id, lot.id))?.qty).toBe('50.0000');
      // 150 bakiyesi değişmedi
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('500.0000');

      // Şimdi müşteriye çıkabilir: 621 borç / 150 alacak (hammadde envanter hesabı)
      const del = await postStockMove(tx, {
        kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(10), uomId: b.kg.id, refType: 'delivery', refId: REF, partnerId: b.customer.id,
      }, ctx);
      expect(del.unitCost.toFixed(4)).toBe('10.0000');
      expect(del.value.toFixed(4)).toBe('100.0000');
      expect((await getAccountBalance(tx, { accountCode: '621', ledger: 'VUK' })).toFixed(4)).toBe('100.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('400.0000');

      // Red: red lot hiçbir yere çıkamaz (fire hariç)
      const { lot: lot2 } = await receiveRaw(tx, b, 'SUP-L3', '5', '10');
      await postStockMove(tx, { kind: 'quarantine_reject', productId: b.raw.id, lotId: lot2.id, fromLocationId: b.loc.kar.id, toLocationId: b.loc.red.id, qty: d(5), uomId: b.kg.id, refType: 'quality_check', refId: REF, note: 'nem yüksek' }, ctx);
      const [lot2Row] = await tx.select().from(stockLots).where(eq(stockLots.id, lot2.id));
      expect(lot2Row!.status).toBe('rejected');
      const e4 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'transfer', productId: b.raw.id, lotId: lot2.id, fromLocationId: b.loc.red.id, toLocationId: b.loc.hamR01.id, qty: d(5), uomId: b.kg.id, refType: 'transfer', refId: REF }, ctx));
      expect((e4 as DomainError).code).toBe('LOT_BLOCKED');
      const scr = await postStockMove(tx, { kind: 'scrap', productId: b.raw.id, lotId: lot2.id, fromLocationId: b.loc.red.id, toLocationId: b.loc.scrap.id, qty: d(5), uomId: b.kg.id, refType: 'scrap', refId: REF }, ctx);
      expect(scr.value.toFixed(4)).toBe('50.0000');
      expect((await getAccountBalance(tx, { accountCode: '659', ledger: 'VUK' })).toFixed(4)).toBe('50.0000');
    });
  });

  it('negatif stok reddedilir; rezervasyon available düşürür', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRaw(tx, b, 'SUP-L4', '30', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const err = await expectReject(tx, (sp) => postStockMove(sp, {
        kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(31), uomId: b.kg.id, refType: 'delivery', refId: REF,
      }, ctx));
      expect((err as DomainError).code).toBe('INSUFFICIENT_STOCK');

      await reserve(tx, { productId: b.raw.id, lotId: lot.id, locationId: b.loc.hamR01.id, qty: d(25) });
      const oh = await getOnHand(tx, { productId: b.raw.id, lotId: lot.id });
      expect(oh.available.toFixed(4)).toBe('5.0000');
      const err2 = await expectReject(tx, (sp) => postStockMove(sp, {
        kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(10), uomId: b.kg.id, refType: 'delivery', refId: REF,
      }, ctx));
      expect((err2 as DomainError).code).toBe('INSUFFICIENT_STOCK');
      // Rezervasyonu tüketerek çıkış
      await postStockMove(tx, {
        kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(10), uomId: b.kg.id, refType: 'delivery', refId: REF, useReserved: true,
      }, ctx);
      const q = await quant(tx, b.raw.id, b.loc.hamR01.id, lot.id);
      expect(q?.qty).toBe('20.0000');
      expect(q?.reservedQty).toBe('15.0000');
      await release(tx, { productId: b.raw.id, lotId: lot.id, locationId: b.loc.hamR01.id, qty: d(100) });
      expect((await quant(tx, b.raw.id, b.loc.hamR01.id, lot.id))?.reservedQty).toBe('0.0000');
      // Quant asla negatif değil
      const all = await tx.select().from(stockQuants).where(eq(stockQuants.productId, b.raw.id));
      for (const r of all) expect(Number(r.qty)).toBeGreaterThanOrEqual(0);
    });
  });

  it('FEFO: en erken SKT önce, NULL SKT en sona; yalnızca released ve internal/pickable', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const late = await receiveRaw(tx, b, 'FEFO-LATE', '40', '10', { expiryDate: daysFromNow(200), toLocationId: b.loc.hamR02.id, status: 'released' });
      const early = await receiveRaw(tx, b, 'FEFO-EARLY', '30', '11', { expiryDate: daysFromNow(20), toLocationId: b.loc.hamR01.id, status: 'released' });
      const nullExp = await receiveRaw(tx, b, 'FEFO-NULL', '50', '9', { toLocationId: b.loc.hamR01.id, status: 'released' });
      // expiryDate null olsun (shelfLife'tan türetildi; testte açıkça sıfırla)
      await tx.update(stockLots).set({ expiryDate: null }).where(eq(stockLots.id, nullExp.lot.id));
      await tx.update(stockQuants).set({ expiryDate: null }).where(eq(stockQuants.lotId, nullExp.lot.id));
      // Karantinadaki lot seçilmemeli
      await receiveRaw(tx, b, 'FEFO-Q', '99', '1', { expiryDate: daysFromNow(1) });
      // Mamul deposundaki (kök dışı) lot seçilmemeli
      await receiveRaw(tx, b, 'FEFO-OUT', '99', '1', { expiryDate: daysFromNow(2), toLocationId: b.loc.mamul.id, status: 'released' });

      const picks = await pickFefo(tx, { productId: b.raw.id, qty: d(100), rootLocationId: b.loc.ham.id });
      expect(picks.map((p) => p.lotId)).toEqual([early.lot.id, late.lot.id, nullExp.lot.id]);
      expect(picks.map((p) => p.qty.toFixed(4))).toEqual(['30.0000', '40.0000', '30.0000']);
      expect(picks[0]!.locationId).toBe(b.loc.hamR01.id);
      expect(picks[1]!.unitCost.toFixed(4)).toBe('10.0000');

      // Rezerve edilen miktar seçilemez
      await reserve(tx, { productId: b.raw.id, lotId: early.lot.id, locationId: b.loc.hamR01.id, qty: d(30) });
      const picks2 = await pickFefo(tx, { productId: b.raw.id, qty: d(10), rootLocationId: b.loc.ham.id });
      expect(picks2[0]!.lotId).toBe(late.lot.id);

      const err = await expectReject(tx, (sp) => pickFefo(sp, { productId: b.raw.id, qty: d(1000), rootLocationId: b.loc.ham.id }));
      expect((err as DomainError).code).toBe('INSUFFICIENT_STOCK');
      const partial = await pickFefo(tx, { productId: b.raw.id, qty: d(1000), rootLocationId: b.loc.ham.id, allowPartial: true });
      expect(partial.reduce((a, p) => a + Number(p.qty), 0)).toBe(90);
    });
  });

  it('consumption/production maliyet akışı: tüketilen değer = üretilen değer − genel gider', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot: rawLot } = await receiveRaw(tx, b, 'RAW-P1', '100', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const WO = '00000000-0000-4000-8000-0000000000aa';

      const cons = await postStockMove(tx, {
        kind: 'consumption', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(40), uomId: b.kg.id, refType: 'work_order', refId: WO,
      }, ctx);
      expect(cons.value.toFixed(4)).toBe('400.0000');
      expect((await getAccountBalance(tx, { accountCode: '151.01', ledger: 'VUK' })).toFixed(4)).toBe('400.0000');
      expect((await getAccountBalance(tx, { accountCode: '151', ledger: 'VUK' })).toFixed(4)).toBe('400.0000'); // ana hesap = alt hesaplar
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('600.0000');

      const overhead = d(50);
      const produced = d(20);
      const unitCost = cons.value.plus(overhead).div(produced); // 22.5
      const outLot = await createLot(tx, { productId: b.finished.id, lotNo: 'PL-260902-H1-01', origin: 'production', productionDate: new Date() }, ctx);
      expect(outLot.status).toBe('released');
      expect(outLot.expiryDate).toBe(daysFromNow(180));
      const prod = await postStockMove(tx, {
        kind: 'production', productId: b.finished.id, lotId: outLot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: produced, uomId: b.kg.id,
        unitCost, overheadValue: overhead, refType: 'work_order', refId: WO,
      }, ctx);
      expect(prod.value.toFixed(4)).toBe('450.0000');
      expect(cons.value.toFixed(4)).toBe(prod.value.minus(overhead).toFixed(4));

      const [outLotRow] = await tx.select().from(stockLots).where(eq(stockLots.id, outLot.id));
      expect(outLotRow!.unitCost).toBe('22.5000');
      expect(outLotRow!.originWorkOrderId).toBe(WO);
      expect(outLotRow!.initialQty).toBe('20.0000');

      for (const ledger of ['VUK', 'UFRS'] as const) {
        expect((await getAccountBalance(tx, { accountCode: '151.01', ledger })).toFixed(4)).toBe('0.0000');
        expect((await getAccountBalance(tx, { accountCode: '152', ledger })).toFixed(4)).toBe('450.0000');
        expect((await getAccountBalance(tx, { accountCode: '731', ledger })).toFixed(4)).toBe('-50.0000');
      }
      // Fişteki satırlar: 152 borç 450; 151.01 alacak 400; 731 alacak 50
      const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, prod.journalEntryIds[0]!));
      const byCode = Object.fromEntries(lines.map((l) => [l.accountCode, l]));
      expect(byCode['152']?.debit).toBe('450.0000');
      expect(byCode['151.01']?.credit).toBe('400.0000');
      expect(byCode['731']?.credit).toBe('50.0000');
      // Genel gider payı move'a yazılır (I15: 151.01'den yalnızca malzeme payı düşer)
      const [prodMove] = await tx.select().from(stockMoves).where(eq(stockMoves.id, prod.moveId));
      expect(prodMove!.overheadValue).toBe('50.0000');
      expect(cons.value.toFixed(4)).toBe(D(prodMove!.value).minus(D(prodMove!.overheadValue)).toFixed(4));

      // Envanter değeri = hesap bakiyesi (I1)
      const ohRaw = await getOnHand(tx, { productId: b.raw.id });
      const ohFin = await getOnHand(tx, { productId: b.finished.id });
      expect(ohRaw.value.toFixed(4)).toBe('600.0000');
      expect(ohFin.value.toFixed(4)).toBe('450.0000');

      // Kalan hammadde tüketilince lot 'consumed'
      await postStockMove(tx, { kind: 'consumption', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(60), uomId: b.kg.id, refType: 'work_order', refId: WO }, ctx);
      const [rawRow] = await tx.select().from(stockLots).where(eq(stockLots.id, rawLot.id));
      expect(rawRow!.status).toBe('consumed');
    });
  });

  it('lotsuz üründe hareketli ağırlıklı ortalama maliyet', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await postStockMove(tx, { kind: 'receipt', productId: b.pack.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(100), uomId: b.kg.id, unitCost: d(2), refType: 'receipt', refId: REF }, ctx);
      await postStockMove(tx, { kind: 'receipt', productId: b.pack.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(100), uomId: b.kg.id, unitCost: d(4), refType: 'receipt', refId: REF }, ctx);
      const [p] = await tx.select().from(products).where(eq(products.id, b.pack.id));
      expect(p!.averageCost).toBe('3.0000');
      const out = await postStockMove(tx, { kind: 'consumption', productId: b.pack.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(50), uomId: b.kg.id, refType: 'work_order', refId: REF }, ctx);
      expect(out.unitCost.toFixed(4)).toBe('3.0000');
      expect(out.value.toFixed(4)).toBe('150.0000');
      const oh = await getOnHand(tx, { productId: b.pack.id });
      expect(oh.qty.toFixed(4)).toBe('150.0000');
      expect(oh.value.toFixed(4)).toBe('450.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('450.0000');
      // Transfer değersiz, quant taşınır
      const tr = await postStockMove(tx, { kind: 'transfer', productId: b.pack.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.hamR02.id, qty: d(150), uomId: b.kg.id, refType: 'transfer', refId: REF }, ctx);
      expect(tr.journalEntryIds).toHaveLength(0);
      expect((await getOnHand(tx, { productId: b.pack.id, locationId: b.loc.hamR02.id })).qty.toFixed(4)).toBe('150.0000');
      const picks = await pickFefo(tx, { productId: b.pack.id, qty: d(10), rootLocationId: b.loc.ham.id });
      expect(picks[0]!.lotId).toBeNull();
      expect(picks[0]!.unitCost.toFixed(4)).toBe('3.0000');
    });
  });
  it('yuvarlama: 4 haneye sığmayan maliyetlerde 15X bakiyesi = round4(Σquant × maliyet) (I1) ve value = round4(qty × maliyet) (I2)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // Lotsuz ürün: 3 × 10 + 1 × 10.0001 → ortalama 10.000025 → 10.0000 (4 hane); fark 679'a yuvarlama satırı
      await postStockMove(tx, { kind: 'receipt', productId: b.pack.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(3), uomId: b.kg.id, unitCost: d('10'), refType: 'receipt', refId: REF }, ctx);
      const r2 = await postStockMove(tx, { kind: 'receipt', productId: b.pack.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(1), uomId: b.kg.id, unitCost: d('10.0001'), refType: 'receipt', refId: REF }, ctx);
      expect(r2.value.toFixed(4)).toBe('10.0001');
      const [p] = await tx.select().from(products).where(eq(products.id, b.pack.id));
      expect(p!.averageCost).toBe('10.0000');
      const inv = await getOnHand(tx, { productId: b.pack.id });
      expect(inv.value.toFixed(4)).toBe('40.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('40.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'UFRS' })).toFixed(4)).toBe('40.0000');
      expect((await getAccountBalance(tx, { accountCode: '659', ledger: 'VUK' })).toFixed(4)).toBe('0.0001');

      // Lotlu ürün: 0.3333 kg × 1.0001 → value 0.3333; sonra 3 ayrı çıkış; her adımda 150 = round4(kalan × maliyet)
      const { lot } = await receiveRaw(tx, b, 'RND-L1', '0.9999', '1.0001', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const [m] = await tx.select().from(stockMoves).where(eq(stockMoves.lotId, lot.id));
      expect(m!.value).toBe('1.0000');
      for (let i = 0; i < 3; i++) {
        await postStockMove(tx, { kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d('0.3333'), uomId: b.kg.id, refType: 'delivery', refId: REF }, ctx);
        const oh = await getOnHand(tx, { productId: b.raw.id, lotId: lot.id });
        const bal = await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' });
        expect(bal.minus(d('40')).toFixed(4)).toBe(oh.value.toFixed(4));
      }
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('40.0000');
    });
  });

  it('aynı lota farklı maliyetle ikinci giriş: lot maliyeti ağırlıklı ortalama, I1 korunur', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRaw(tx, b, 'WA-L1', '100', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });
      await postStockMove(tx, { kind: 'receipt', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(50), uomId: b.kg.id, unitCost: d('13'), refType: 'receipt', refId: REF }, ctx);
      const [row] = await tx.select().from(stockLots).where(eq(stockLots.id, lot.id));
      expect(row!.unitCost).toBe('11.0000'); // (1000 + 650) / 150
      expect(row!.initialQty).toBe('150.0000');
      expect((await getOnHand(tx, { productId: b.raw.id, lotId: lot.id })).value.toFixed(4)).toBe('1650.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('1650.0000');

      // Çıkışta çağıranın verdiği maliyet yok sayılır; lot maliyeti kullanılır
      const out = await postStockMove(tx, { kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(10), uomId: b.kg.id, unitCost: d('1'), refType: 'delivery', refId: REF }, ctx);
      expect(out.unitCost.toFixed(4)).toBe('11.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('1540.0000');
    });
  });

  it('ledger kurallarını çağıran aşamaz: yön/kullanım uyuşmazlığı, isValued=false, SKT geçmiş lot', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot } = await receiveRaw(tx, b, 'DIR-L1', '10', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });
      // delivery fiziksel lokasyona olamaz (621/150 fişi atılır ama stok yerinde kalırdı)
      const e1 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.hamR02.id, qty: d(1), uomId: b.kg.id, refType: 'delivery', refId: REF }, ctx));
      expect((e1 as DomainError).code).toBe('MOVE_DIRECTION_INVALID');
      // consumption hedefi production olmalı
      const e2 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'consumption', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.scrap.id, qty: d(1), uomId: b.kg.id, refType: 'work_order', refId: REF }, ctx));
      expect((e2 as DomainError).code).toBe('MOVE_DIRECTION_INVALID');
      // transfer sanal lokasyona olamaz
      const e3 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'transfer', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(1), uomId: b.kg.id, refType: 'transfer', refId: REF }, ctx));
      expect((e3 as DomainError).code).toBe('MOVE_DIRECTION_INVALID');
      // isValued:false değerli hareketi değersiz yapamaz
      const del = await postStockMove(tx, { kind: 'delivery', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(1), uomId: b.kg.id, refType: 'delivery', refId: REF, isValued: false }, ctx);
      expect(del.journalEntryIds).toHaveLength(2);
      // SKT geçmiş (durumu hâlâ released) lot sevk edilemez / üretime giremez; fire olabilir
      const { lot: old } = await receiveRaw(tx, b, 'EXP-L1', '5', '10', { toLocationId: b.loc.hamR01.id, status: 'released', expiryDate: daysFromNow(-1) });
      const e4 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'delivery', productId: b.raw.id, lotId: old.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.cust.id, qty: d(1), uomId: b.kg.id, refType: 'delivery', refId: REF }, ctx));
      expect((e4 as DomainError).code).toBe('LOT_EXPIRED');
      const e5 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'consumption', productId: b.raw.id, lotId: old.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(1), uomId: b.kg.id, refType: 'work_order', refId: REF }, ctx));
      expect((e5 as DomainError).code).toBe('LOT_EXPIRED');
      // FEFO SKT geçmiş lotu seçmez; excludeLotIds da çalışır
      const picks = await pickFefo(tx, { productId: b.raw.id, qty: d(5), rootLocationId: b.loc.ham.id });
      expect(picks.map((p) => p.lotId)).toEqual([lot.id]);
      const picks2 = await pickFefo(tx, { productId: b.raw.id, qty: d(5), rootLocationId: b.loc.ham.id, excludeLotIds: [lot.id], allowPartial: true });
      expect(picks2).toHaveLength(0);
      await postStockMove(tx, { kind: 'scrap', productId: b.raw.id, lotId: old.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.scrap.id, qty: d(5), uomId: b.kg.id, refType: 'scrap', refId: REF }, ctx);
    });
  });

  it('yarı mamul çıktı 151.02 borç / 151.01 alacak; 151 ana hesabına doğrudan kayıt reddedilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const [semi] = await tx.insert(products).values({
        sku: `4${b.s}01`, name: `Badem Sütü Bazı YM ${b.s}`, type: 'semi_finished', uomId: b.kg.id, isLotTracked: true, isManufactured: true, costMethod: 'lot', shelfLifeDays: 30,
      }).returning();
      const { lot: rawLot } = await receiveRaw(tx, b, 'RAW-S1', '10', '5', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const WO = '00000000-0000-4000-8000-0000000000ab';
      await postStockMove(tx, { kind: 'consumption', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(10), uomId: b.kg.id, refType: 'work_order', refId: WO }, ctx);
      const semiLot = await createLot(tx, { productId: semi!.id, lotNo: 'PL-YM-01', origin: 'production', productionDate: new Date() }, ctx);
      const out = await postStockMove(tx, {
        kind: 'production', productId: semi!.id, lotId: semiLot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: d(5), uomId: b.kg.id,
        unitCost: d(10), refType: 'work_order', refId: WO,
      }, ctx);
      expect(out.value.toFixed(4)).toBe('50.0000');
      const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, out.journalEntryIds[0]!));
      const byCode = Object.fromEntries(lines.map((l) => [l.accountCode, l]));
      expect(byCode['151.02']?.debit).toBe('50.0000');
      expect(byCode['151.01']?.credit).toBe('50.0000');
      expect(byCode['731']).toBeUndefined();
      const [move] = await tx.select().from(stockMoves).where(eq(stockMoves.id, out.moveId));
      expect(move!.overheadValue).toBeNull();
      for (const ledger of ['VUK', 'UFRS'] as const) {
        expect((await getAccountBalance(tx, { accountCode: '151.02', ledger })).toFixed(4)).toBe('50.0000');
        expect((await getAccountBalance(tx, { accountCode: '151.01', ledger })).toFixed(4)).toBe('0.0000');
        expect((await getAccountBalance(tx, { accountCode: '151', ledger })).toFixed(4)).toBe('50.0000');
      }
      expect((await getOnHand(tx, { productId: semi!.id })).value.toFixed(4)).toBe('50.0000');

      // Yarı mamul tüketimi: 151.01 borç / 151.02 alacak
      const cons2 = await postStockMove(tx, { kind: 'consumption', productId: semi!.id, lotId: semiLot.id, fromLocationId: b.loc.mamul.id, toLocationId: b.loc.prod.id, qty: d(2), uomId: b.kg.id, refType: 'work_order', refId: WO }, ctx);
      const l2 = await tx.select().from(journalLines).where(eq(journalLines.entryId, cons2.journalEntryIds[0]!));
      const c2 = Object.fromEntries(l2.map((l) => [l.accountCode, l]));
      expect(c2['151.01']?.debit).toBe('20.0000');
      expect(c2['151.02']?.credit).toBe('20.0000');

      // 151 ana hesabı kayıt almaz
      const err = await expectReject(tx, (sp) => postJournalEntry(sp, {
        ledger: 'VUK', journalCode: 'GEN', entryDate: new Date(), description: 'ana hesaba kayıt',
        lines: [{ accountCode: '151', debit: d(1) }, { accountCode: '500', credit: d(1) }],
      }, ctx));
      expect((err as DomainError).code).toBe('ACCOUNT_NOT_POSTABLE');
    });
  });

  it('iş emri WIP firesi: üretim lokasyonundan fire → 659 / 151.01, quant değişmez; fiziksel fire 659 / 15X', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const { lot: rawLot } = await receiveRaw(tx, b, 'RAW-W1', '100', '10', { toLocationId: b.loc.hamR01.id, status: 'released' });
      const WO = '00000000-0000-4000-8000-0000000000ac';
      await postStockMove(tx, { kind: 'consumption', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(40), uomId: b.kg.id, refType: 'work_order', refId: WO }, ctx);
      expect((await getAccountBalance(tx, { accountCode: '151.01', ledger: 'VUK' })).toFixed(4)).toBe('400.0000');

      // İş emri dışı kaynak reddedilir
      const e1 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'scrap', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.scrap.id, qty: d(3), uomId: b.kg.id, refType: 'scrap', refId: WO }, ctx));
      expect((e1 as DomainError).code).toBe('WIP_SCRAP_REQUIRES_WORK_ORDER');
      // Üretim lokasyonundan yalnızca fire lokasyonuna
      const e2 = await expectReject(tx, (sp) => postStockMove(sp, { kind: 'scrap', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.loss.id, qty: d(3), uomId: b.kg.id, refType: 'work_order', refId: WO }, ctx));
      expect((e2 as DomainError).code).toBe('MOVE_DIRECTION_INVALID');

      const quantsBefore = await tx.select().from(stockQuants).where(eq(stockQuants.productId, b.raw.id));
      const scr = await postStockMove(tx, { kind: 'scrap', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.scrap.id, qty: d(3), uomId: b.kg.id, refType: 'work_order', refId: WO, note: 'dökülme' }, ctx);
      expect(scr.unitCost.toFixed(4)).toBe('10.0000'); // lot maliyeti
      expect(scr.value.toFixed(4)).toBe('30.0000');
      expect(scr.journalEntryIds).toHaveLength(2);
      const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, scr.journalEntryIds[0]!));
      const byCode = Object.fromEntries(lines.map((l) => [l.accountCode, l]));
      expect(byCode['659']?.debit).toBe('30.0000');
      expect(byCode['151.01']?.credit).toBe('30.0000');
      expect(byCode['150']).toBeUndefined();
      expect((await getAccountBalance(tx, { accountCode: '151.01', ledger: 'VUK' })).toFixed(4)).toBe('370.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('600.0000');
      // Quant'lar değişmedi (I1 korunur)
      const quantsAfter = await tx.select().from(stockQuants).where(eq(stockQuants.productId, b.raw.id));
      expect(quantsAfter.map((q) => [q.locationId, q.qty])).toEqual(quantsBefore.map((q) => [q.locationId, q.qty]));
      expect((await getOnHand(tx, { productId: b.raw.id })).value.toFixed(4)).toBe('600.0000');

      // Lotsuz üründe WIP firesi verilen maliyetle değerlenir
      await postStockMove(tx, { kind: 'receipt', productId: b.pack.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(10), uomId: b.kg.id, unitCost: d(2), refType: 'receipt', refId: REF }, ctx);
      await postStockMove(tx, { kind: 'consumption', productId: b.pack.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.prod.id, qty: d(10), uomId: b.kg.id, refType: 'work_order', refId: WO }, ctx);
      const scr2 = await postStockMove(tx, { kind: 'scrap', productId: b.pack.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.scrap.id, qty: d(4), uomId: b.kg.id, unitCost: d('2.5'), refType: 'work_order', refId: WO }, ctx);
      expect(scr2.value.toFixed(4)).toBe('10.0000');
      expect((await getAccountBalance(tx, { accountCode: '151.01', ledger: 'VUK' })).toFixed(4)).toBe('380.0000'); // 370 + 20 − 10

      // Fiziksel stoktan iş emri kaynaklı fire yine 659 / 150 (quant düşer, I1 korunur)
      const scr3 = await postStockMove(tx, { kind: 'scrap', productId: b.raw.id, lotId: rawLot.id, fromLocationId: b.loc.hamR01.id, toLocationId: b.loc.scrap.id, qty: d(5), uomId: b.kg.id, refType: 'work_order', refId: WO }, ctx);
      const l3 = await tx.select().from(journalLines).where(eq(journalLines.entryId, scr3.journalEntryIds[0]!));
      expect(Object.fromEntries(l3.map((l) => [l.accountCode, l]))['150']?.credit).toBe('50.0000');
      expect((await getAccountBalance(tx, { accountCode: '150', ledger: 'VUK' })).toFixed(4)).toBe('550.0000');
      expect((await getOnHand(tx, { productId: b.raw.id })).value.toFixed(4)).toBe('550.0000');
    });
  });

  it('FEFO uyarı/kaldırma: ürün kartındaki gün ofsetleri öncelikli, yoksa yüzde kuralı', async () => {
    expect(fefoDates(null, 100)).toEqual({ alertDate: null, removalDate: null });
    expect(fefoDates('2026-12-31', 365)).toEqual({ alertDate: addDays('2026-12-31', -90), removalDate: addDays('2026-12-31', -14) });
    expect(fefoDates('2026-12-31', { shelfLifeDays: 20 })).toEqual({ alertDate: addDays('2026-12-31', -7), removalDate: addDays('2026-12-31', -1) });
    expect(fefoDates('2026-12-31', { shelfLifeDays: 365, alertDaysBeforeExpiry: 45, removalDaysBeforeExpiry: 10 })).toEqual({ alertDate: '2026-11-16', removalDate: '2026-12-21' });
    expect(fefoDates('2026-12-31', { shelfLifeDays: 365, alertDaysBeforeExpiry: 45, removalDaysBeforeExpiry: null })).toEqual({ alertDate: '2026-11-16', removalDate: addDays('2026-12-31', -14) });
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await tx.update(products).set({ alertDaysBeforeExpiry: 60, removalDaysBeforeExpiry: 5 }).where(eq(products.id, b.raw.id));
      const lot = await createLot(tx, { productId: b.raw.id, lotNo: 'OFS-1', origin: 'receipt', expiryDate: '2027-03-01' }, ctx);
      expect(lot.alertDate).toBe(addDays('2027-03-01', -60));
      expect(lot.removalDate).toBe(addDays('2027-03-01', -5));
      const lot2 = await createLot(tx, { productId: b.finished.id, lotNo: 'OFS-2', origin: 'production', expiryDate: '2027-03-01' }, ctx);
      expect(lot2.alertDate).toBe(addDays('2027-03-01', -45)); // 180 × %25
      expect(lot2.removalDate).toBe(addDays('2027-03-01', -9)); // 180 × %5
    });
  });

  it('lotsuz quant upsert: eşzamanlı iki giriş tek satırda toplanır (NULLS NOT DISTINCT)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      for (let i = 0; i < 3; i++) {
        await postStockMove(tx, { kind: 'receipt', productId: b.pack.id, fromLocationId: b.loc.sup.id, toLocationId: b.loc.hamR01.id, qty: d(5), uomId: b.kg.id, unitCost: d(1), refType: 'receipt', refId: REF }, ctx);
      }
      const rows = await tx.select().from(stockQuants).where(and(eq(stockQuants.productId, b.pack.id), eq(stockQuants.locationId, b.loc.hamR01.id)));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.lotId).toBeNull();
      expect(rows[0]!.qty).toBe('15.0000');
      // Aynı anahtarla ikinci satır eklenemez (unique kısıt gerçek)
      const err = await expectReject(tx, (sp) => sp.insert(stockQuants).values({ productId: b.pack.id, locationId: b.loc.hamR01.id, lotId: null, qty: '1.0000' }));
      const cause = (err as Error & { cause?: { constraint_name?: string; code?: string } }).cause;
      expect(cause?.constraint_name ?? cause?.code).toBe(cause?.constraint_name ? 'stock_quants_uq' : '23505');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@plantero/db';
import { seedBase, withRollback, expectReject, ctx, d } from '../__tests__/helpers.js';
import { createLot, postStockMove } from '../stock/ledger.js';
import { createIncomingCheck, recordResults, decide } from './checks.js';

const { stockQuants } = schema;

async function makeQuarantineLot(tx: Parameters<typeof createLot>[0], base: Awaited<ReturnType<typeof seedBase>>, qty = 50) {
  const lot = await createLot(tx, { productId: base.raw.id, lotNo: `L-${base.s}-${Math.random().toString(36).slice(2, 6)}`, origin: 'receipt', unitCost: d(100), status: 'quarantine' }, ctx);
  await postStockMove(tx, {
    kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.kar.id,
    qty: d(qty), uomId: base.kg.id, unitCost: d(100), refType: 'receipt', refId: lot.id, refNo: lot.lotNo,
  }, ctx);
  const check = await createIncomingCheck(tx, { productId: base.raw.id, lotId: lot.id, supplierId: base.supplier.id, kind: 'incoming' }, ctx);
  await recordResults(tx, check.id, [{ name: 'Nem %', kind: 'numeric', valueNumeric: d(8) }], ctx);
  return { lot, check };
}

describe('quality/checks decide()', () => {
  it('serbest bırakma: lot released olur, quant tam olarak hedefe taşınır', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const { lot, check } = await makeQuarantineLot(tx, base, 50);
      const res = await decide(tx, check.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx);
      expect(res.lot.status).toBe('released');
      expect(res.check.result).toBe('passed');
      const [q] = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, base.loc.hamR01.id));
      expect(q?.qty).toBe('50.0000');
      const [kq] = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, base.loc.kar.id));
      expect(kq === undefined || kq.qty === '0.0000').toBe(true);
      void lot;
    });
  });

  it('reddet + tedarikçiye iade: lot rejected olur, RED lokasyonuna taşınır; iade NİYETİ karar notuna işlenir ama 320.999\'u bozacak bir return_out ÜRETMEZ (I25 — canlı ölçümle bulunan kök neden düzeltmesi)', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const { check } = await makeQuarantineLot(tx, base, 30);
      const res = await decide(tx, check.id, { decision: 'rejected', rejectToLocationId: base.loc.red.id, returnToSupplier: true, note: 'Nem oranı spesifikasyon dışı' }, ctx);
      expect(res.lot.status).toBe('rejected');
      expect(res.check.result).toBe('failed');
      expect(res.moveIds.length).toBe(1); // yalnızca quarantine_reject — return_out YOK
      expect(res.check.decisionNote).toMatch(/iade/i);
      const [rq] = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, base.loc.red.id));
      expect(rq?.qty).toBe('30.0000'); // iade edilmedi, RED lokasyonunda bekliyor
    });
  });

  it('ledger bir lotu iki kez karantina kararına sokmaz (aynı lotta "kısmi" imkânsız — split mal kabulde yapılır)', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const { lot, check } = await makeQuarantineLot(tx, base, 100);
      await decide(tx, check.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx);
      // Aynı lot üzerinde ikinci bir karantina hareketi (bu kez red) ledger tarafından reddedilir —
      // `enforceLotRules` `lot.status === 'quarantine'` şartı arar, released olduktan sonra tekrar
      // sağlanamaz. Kanıtlanan gerçek kural: "kısmi" karar yalnızca mal kabulde (iki ayrı lot) mümkündür.
      const err = await expectReject(tx, (sp) =>
        postStockMove(sp, {
          kind: 'quarantine_reject', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.hamR01.id, toLocationId: base.loc.red.id,
          qty: d(10), uomId: base.kg.id, refType: 'quality_check', refId: check.id,
        }, ctx),
      );
      expect(String((err as Error).message)).toMatch(/karantinada değil/);
    });
  });

  it('zaten karara bağlanmış kontrol tekrar karara bağlanamaz', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const { check } = await makeQuarantineLot(tx, base, 10);
      await decide(tx, check.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx);
      const err = await expectReject(tx, (sp) => decide(sp, check.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx));
      expect(String((err as Error).message)).toMatch(/karara bağlanmış/);
    });
  });

  it('karantina lotu QC geçmeden üretime/sevke giremez', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const { lot } = await makeQuarantineLot(tx, base, 10);
      const err = await expectReject(tx, (sp) =>
        postStockMove(sp, {
          kind: 'consumption', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.kar.id, toLocationId: base.loc.prod.id,
          qty: d(5), uomId: base.kg.id, refType: 'work_order', refId: lot.id,
        }, ctx),
      );
      expect(String((err as Error).message)).toMatch(/serbest|released/i);
    });
  });
});

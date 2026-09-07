import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@plantero/db';
import { seedBase, withRollback, expectReject, ctx, d } from '../__tests__/helpers.js';
import { createLot, postStockMove } from '../stock/ledger.js';
import { createAndReceive } from '../stock/receipts.js';
import { createIncomingCheck, recordResults, decide, checkHasCriticalFail } from './checks.js';
import { createTemplate, updateTemplate } from './templates.js';
import type { DomainError } from '../auth/errors.js';

const { stockQuants, qcChecks, qcTemplateItems, receipts } = schema;

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

  it("P0 canlı doğrulama (Kaju/Anadolu Kuruyemiş S-000005): QC kararı verilince bağlı mal kabul 'qc_pending'den 'done'a geçer — computeSupplierScores yalnızca status='done' sayar", async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx); // base.raw: requiresIncomingQc=true
      const { receipt } = await createAndReceive(tx, {
        warehouseId: base.wh.id, partnerId: base.supplier.id,
        lines: [{ productId: base.raw.id, qty: d(40), uomId: base.kg.id, unitCost: d(100) }],
      }, ctx);
      // receiveGoods() QC gerektiren ürünü otomatik karantinaya alıp bekleyen qc_checks açar.
      expect(receipt.status).toBe('qc_pending');
      const [check] = await tx.select().from(qcChecks).where(eq(qcChecks.receiptId, receipt.id));
      expect(check).toBeTruthy();
      await recordResults(tx, check!.id, [{ name: 'Nem %', kind: 'numeric', valueNumeric: d(8) }], ctx);
      await decide(tx, check!.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx);
      const [updatedReceipt] = await tx.select().from(receipts).where(eq(receipts.id, receipt.id));
      expect(updatedReceipt?.status).toBe('done');
    });
  });

  it("kısmi kapanış: bir mal kabulde BİRDEN FAZLA bekleyen QC varsa, biri karara bağlanınca mal kabul 'qc_pending'de kalır", async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const { receipt } = await createAndReceive(tx, {
        warehouseId: base.wh.id, partnerId: base.supplier.id,
        lines: [
          { productId: base.raw.id, qty: d(20), uomId: base.kg.id, unitCost: d(100), supplierLotNo: 'L1' },
          { productId: base.raw.id, qty: d(15), uomId: base.kg.id, unitCost: d(100), supplierLotNo: 'L2' },
        ],
      }, ctx);
      expect(receipt.status).toBe('qc_pending');
      const checkRows = await tx.select().from(qcChecks).where(eq(qcChecks.receiptId, receipt.id));
      expect(checkRows.length).toBe(2);
      await recordResults(tx, checkRows[0]!.id, [{ name: 'Nem %', kind: 'numeric', valueNumeric: d(8) }], ctx);
      await decide(tx, checkRows[0]!.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx);
      const [midReceipt] = await tx.select().from(receipts).where(eq(receipts.id, receipt.id));
      expect(midReceipt?.status).toBe('qc_pending'); // ikinci lot hâlâ bekliyor
      await recordResults(tx, checkRows[1]!.id, [{ name: 'Nem %', kind: 'numeric', valueNumeric: d(8) }], ctx);
      await decide(tx, checkRows[1]!.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx);
      const [doneReceipt] = await tx.select().from(receipts).where(eq(receipts.id, receipt.id));
      expect(doneReceipt?.status).toBe('done');
    });
  });
});

/**
 * I61 (Tur 12, P0, veri-critic) regresyon testi — CANLI OLARAK KANITLANMIŞ açığın kalıcı testi:
 * `decide()` artık kritik bir kalem BAŞARISIZ iken 'released' kararını `QC_CRITICAL_FAIL_BLOCKED`
 * ile reddediyor; `checkHasCriticalFail` bu kararı `qc_check_results`/`qc_template_items`ten
 * CANLI (dondurulmuş bir bayrağa değil) okuyor.
 */
describe('quality/checks — I61 kritik başarısızlıkta serbest bırakma engeli', () => {
  it('kritik kalem başarısız (spesifikasyon dışı) iken decide(released) reddedilir; lot pending kalır', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const tpl = await createTemplate(tx, {
        code: `AFLA-${base.s}`, name: 'Aflatoksin taraması', items: [
          { name: 'Aflatoksin', kind: 'numeric', minValue: '0', maxValue: '5', isCritical: true },
        ],
      }, ctx);
      const [item] = await tx.select().from(qcTemplateItems).where(eq(qcTemplateItems.templateId, tpl.id));
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `L-${base.s}`, origin: 'receipt', unitCost: d(100), status: 'quarantine' }, ctx);
      await postStockMove(tx, {
        kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.kar.id,
        qty: d(20), uomId: base.kg.id, unitCost: d(100), refType: 'receipt', refId: lot.id, refNo: lot.lotNo,
      }, ctx);
      const check = await createIncomingCheck(tx, { productId: base.raw.id, lotId: lot.id, supplierId: base.supplier.id, templateId: tpl.id, kind: 'incoming' }, ctx);
      // Aflatoksin 40, limit 5 — kritik kalem başarısız
      const rr = await recordResults(tx, check.id, [{ templateItemId: item!.id, name: 'Aflatoksin', kind: 'numeric', valueNumeric: d(40) }], ctx);
      expect(rr.allPassed).toBe(false);
      expect(rr.anyCritical).toBe(true);
      expect(await checkHasCriticalFail(tx, check.id)).toBe(true);

      const err = await expectReject(tx, (sp) => decide(sp, check.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx));
      expect((err as DomainError).code).toBe('QC_CRITICAL_FAIL_BLOCKED');

      // Engellenen karar hiçbir iz bırakmadı: check hâlâ pending, lot hâlâ quarantine, stok taşınmadı
      const [afterCheck] = await tx.select().from(qcChecks).where(eq(qcChecks.id, check.id)).limit(1);
      expect(afterCheck?.result).toBe('pending');
      const [q] = await tx.select().from(stockQuants).where(eq(stockQuants.locationId, base.loc.hamR01.id));
      expect(q === undefined || q.qty === '0.0000').toBe(true);

      // reddetme yolu hâlâ çalışır — yalnızca 'released' engellenir
      const res = await decide(tx, check.id, { decision: 'rejected', rejectToLocationId: base.loc.red.id, note: 'Aflatoksin limit aşımı' }, ctx);
      expect(res.lot.status).toBe('rejected');
      expect(res.check.result).toBe('failed');
    });
  });

  it('kritik olmayan bir kalem başarısızken serbest bırakma engellenmez (yalnızca kritik kalemler bloklar)', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const tpl = await createTemplate(tx, {
        code: `NEM-${base.s}`, name: 'Nem taraması', items: [
          { name: 'Nem %', kind: 'numeric', minValue: '0', maxValue: '10', isCritical: false },
        ],
      }, ctx);
      const [item] = await tx.select().from(qcTemplateItems).where(eq(qcTemplateItems.templateId, tpl.id));
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `L-${base.s}`, origin: 'receipt', unitCost: d(100), status: 'quarantine' }, ctx);
      await postStockMove(tx, {
        kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.kar.id,
        qty: d(20), uomId: base.kg.id, unitCost: d(100), refType: 'receipt', refId: lot.id, refNo: lot.lotNo,
      }, ctx);
      const check = await createIncomingCheck(tx, { productId: base.raw.id, lotId: lot.id, supplierId: base.supplier.id, templateId: tpl.id, kind: 'incoming' }, ctx);
      await recordResults(tx, check.id, [{ templateItemId: item!.id, name: 'Nem %', kind: 'numeric', valueNumeric: d(15) }], ctx);
      expect(await checkHasCriticalFail(tx, check.id)).toBe(false);
      const res = await decide(tx, check.id, { decision: 'released', releaseToLocationId: base.loc.hamR01.id }, ctx);
      expect(res.lot.status).toBe('released');
    });
  });
});

/**
 * I62 (Tur 12, P2, veri-critic) regresyon testi — kök neden düzeltmesi `templates.ts::updateTemplate`.
 * CANLI OLARAK KANITLANDI: kayıtlı sonucu olan bir kaleme sahip şablon güncellenmeye çalışıldığında
 * önceden ham bir Postgres FK ihlali hatasıyla çöküyordu (kalemler her güncellemede silinip yeni
 * id'lerle yeniden yazılıyor); artık anlaşılır bir `DomainError('QC_TEMPLATE_ITEM_IN_USE', ...)` ile
 * reddediliyor — bu da I62'nin tarif ettiği "sessiz drift"i kökten imkânsız kılıyor (kullanılan bir
 * kalemin min/max'ı artık hiçbir şekilde değiştirilemiyor).
 */
describe('quality/templates — I62 kayıtlı sonucu olan şablon kalemi düzenlenemez', () => {
  it('sonuç kaydedilmiş kaleme sahip şablon güncellemesi QC_TEMPLATE_ITEM_IN_USE ile reddedilir, ham FK hatası sızmaz', async () => {
    await withRollback(async (tx) => {
      const base = await seedBase(tx);
      const tpl = await createTemplate(tx, {
        code: `TPL-${base.s}`, name: 'Test şablonu', items: [{ name: 'Aflatoksin', kind: 'numeric', minValue: '0', maxValue: '5', isCritical: true }],
      }, ctx);
      const [item] = await tx.select().from(qcTemplateItems).where(eq(qcTemplateItems.templateId, tpl.id));
      const lot = await createLot(tx, { productId: base.raw.id, lotNo: `L-${base.s}`, origin: 'receipt', unitCost: d(100), status: 'quarantine' }, ctx);
      await postStockMove(tx, {
        kind: 'receipt', productId: base.raw.id, lotId: lot.id, fromLocationId: base.loc.sup.id, toLocationId: base.loc.kar.id,
        qty: d(10), uomId: base.kg.id, unitCost: d(100), refType: 'receipt', refId: lot.id, refNo: lot.lotNo,
      }, ctx);
      const check = await createIncomingCheck(tx, { productId: base.raw.id, lotId: lot.id, supplierId: base.supplier.id, templateId: tpl.id, kind: 'incoming' }, ctx);
      await recordResults(tx, check.id, [{ templateItemId: item!.id, name: 'Aflatoksin', kind: 'numeric', valueNumeric: d(2) }], ctx);

      const err = await expectReject(tx, (sp) => updateTemplate(sp, tpl.id, {
        code: tpl.code, name: tpl.name, items: [{ name: 'Aflatoksin', kind: 'numeric', minValue: '0', maxValue: '1', isCritical: true }],
      }, ctx));
      expect((err as DomainError).code).toBe('QC_TEMPLATE_ITEM_IN_USE');

      // Kullanılmayan bir şablon hâlâ normal şekilde güncellenebilir (regresyon değil)
      const tpl2 = await createTemplate(tx, {
        code: `TPL2-${base.s}`, name: 'Kullanılmamış şablon', items: [{ name: 'Renk', kind: 'text' }],
      }, ctx);
      const updated = await updateTemplate(tx, tpl2.id, { code: tpl2.code, name: 'Kullanılmamış şablon (v2)', items: [{ name: 'Renk', kind: 'text' }] }, ctx);
      expect(updated.name).toBe('Kullanılmamış şablon (v2)');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { journals, salesChannels, partners, bankAccounts, bankTransactions, payments, deliveryLines, invoices, reconciliationMatches, auditLog, type Tx } from '@plantero/db';
import { createSalesDoc, confirmOrder } from './orders.js';
import { createInvoiceFromDelivery } from './invoicing.js';
import { createLot, postStockMove } from '../stock/ledger.js';
import { reserveFefo, confirmPick, shipDelivery } from '../stock/deliveries.js';
import { computeSettlementTotals, createChannelSettlement, markChannelSettlementPaid } from './channelSettlements.js';
import { withRollback, seedBase, ctx, d, today, expectReject, type Base } from '../__tests__/helpers.js';

/** payments.ts'in ana fişi (BNK) + orders.ts'in fatura fişi (SAT) — seedBase bunları içermez. */
async function ensureJournals(tx: Tx) {
  for (const j of [
    { code: 'BNK', name: 'Banka Yevmiyesi', kind: 'bank' as const, defaultAccountCode: '102' },
    { code: 'SAT', name: 'Satış Yevmiyesi', kind: 'sales' as const, defaultAccountCode: '600' },
  ]) {
    await tx.insert(journals).values(j).onConflictDoNothing({ target: journals.code });
  }
}

async function seedMarketplaceChannel(tx: Tx, b: Base) {
  const [channel] = await tx.insert(salesChannels).values({ code: `MKT-${b.s}`, name: `Pazaryeri ${b.s}`, kind: 'marketplace', commissionPct: '20', shippingDeductionPerOrder: '10' }).returning();
  await tx.update(partners).set({ defaultChannelId: channel!.id }).where(eq(partners.id, b.customer.id));
  return channel!;
}

async function seedBankAccount(tx: Tx, b: Base, currency = 'TRY') {
  const [acc] = await tx.insert(bankAccounts).values({ code: `BA-${b.s}`, bankName: 'Test Bankası', currency, accountCode: '102' }).returning();
  return acc!;
}

async function stockFinished(tx: Tx, b: Base, lotNo: string, qty: string) {
  const lot = await createLot(tx, { productId: b.finished.id, lotNo, origin: 'production', unitCost: d(40), status: 'released' }, ctx);
  await postStockMove(tx, { kind: 'production', productId: b.finished.id, lotId: lot.id, fromLocationId: b.loc.prod.id, toLocationId: b.loc.mamul.id, qty: d(qty), uomId: b.kg.id, unitCost: d(40), refType: 'work_order', refId: '00000000-0000-4000-8000-000000000099' }, ctx);
  return lot;
}

/** Sipariş → onay → sevk → fatura (status='invoiced', açık fatura bakiyesi = grandTotal). */
async function createInvoicedOrder(tx: Tx, b: Base, channelId: string, qty: number, unitPrice: number) {
  const { order } = await createSalesDoc(tx, {
    docType: 'order', partnerId: b.customer.id, channelId, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
    lines: [{ productId: b.finished.id, qty: d(qty), unitPrice: d(unitPrice) }],
  }, ctx);
  const { delivery } = await confirmOrder(tx, order.id, ctx);
  await reserveFefo(tx, delivery.id, ctx);
  const [line] = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
  await confirmPick(tx, { deliveryId: delivery.id, lineId: line!.id, scannedLotId: line!.lotId }, ctx);
  await shipDelivery(tx, delivery.id, ctx);
  const { invoice } = await createInvoiceFromDelivery(tx, delivery.id, ctx);
  return { order, invoice };
}

describe('sales/channelSettlements — hakediş: gerçek toplamlar + gerçek ödeme izi', () => {
  it('computeSettlementTotals yalnızca FATURALANMIŞ siparişleri, o dönemde ve o kanalda toplar', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const channel = await seedMarketplaceChannel(tx, b);
      await stockFinished(tx, b, 'PL-SETL-1', '30');

      const { order } = await createSalesDoc(tx, {
        docType: 'order', partnerId: b.customer.id, channelId: channel.id, warehouseId: b.wh.id, orderDate: today(), currency: 'TRY',
        lines: [{ productId: b.finished.id, qty: d(10), unitPrice: d(200) }],
      }, ctx);
      // draft sipariş henüz toplanmaz
      const draftTotals = await computeSettlementTotals(tx, channel.id, today(), today());
      expect(draftTotals.orderCount).toBe(0);
      expect(draftTotals.netPayout.toFixed(4)).toBe('0.0000');

      const { delivery } = await confirmOrder(tx, order.id, ctx);
      // confirmed/delivered de sayılmaz — hakediş yalnızca gelirin muhasebeye (120/600) düştüğü
      // FATURALANMIŞ siparişi sayar (marketplace henüz faturalanmamış bir sipariş için ödeyemez)
      const confirmedTotals = await computeSettlementTotals(tx, channel.id, today(), today());
      expect(confirmedTotals.orderCount).toBe(0);

      // 10 × 200 = 2000 subtotal; KDV %1 = 20; grandTotal 2020; komisyon %20=400, kargo 10 → net 2000-400-10=1590
      await reserveFefo(tx, delivery.id, ctx);
      const [line] = await tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, delivery.id));
      await confirmPick(tx, { deliveryId: delivery.id, lineId: line!.id, scannedLotId: line!.lotId }, ctx);
      await shipDelivery(tx, delivery.id, ctx);
      await createInvoiceFromDelivery(tx, delivery.id, ctx);

      const totals = await computeSettlementTotals(tx, channel.id, today(), today());
      expect(totals.orderCount).toBe(1);
      expect(totals.netPayout.toFixed(4)).toBe('1590.0000');
    });
  });

  it('createChannelSettlement + markChannelSettlementPaid: gerçek banka hareketi + tahsilat üretir, uydurma rakam yok', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const channel = await seedMarketplaceChannel(tx, b);
      const bank = await seedBankAccount(tx, b);
      await stockFinished(tx, b, 'PL-SETL-2', '30');

      const { invoice } = await createInvoicedOrder(tx, b, channel.id, 10, 200);
      expect(invoice.grandTotal).toBe('2020.0000');

      const totals = await computeSettlementTotals(tx, channel.id, today(), today());
      expect(totals.orderCount).toBe(1);
      expect(totals.grossSales.toFixed(4)).toBe('2020.0000');
      expect(totals.commissions.toFixed(4)).toBe('400.0000');
      expect(totals.shippingDeductions.toFixed(4)).toBe('10.0000');
      expect(totals.netPayout.toFixed(4)).toBe('1590.0000');

      const settlement = await createChannelSettlement(tx, { channelId: channel.id, periodStart: today(), periodEnd: today() }, ctx);
      expect(settlement.status).toBe('open');
      expect(settlement.netPayout).toBe('1590.0000'); // seed'deki gibi sabit değil — gerçek sipariş toplamından
      expect(settlement.bankTransactionId).toBeNull();
      expect(settlement.paidAt).toBeNull();

      const result = await markChannelSettlementPaid(tx, settlement.id, { paymentDate: today(), bankAccountId: bank.id }, ctx);
      expect(result.settlement.status).toBe('paid');
      expect(result.settlement.paidAt).toBe(today());
      expect(result.settlement.bankTransactionId).toBe(result.bankTransactionId);

      // Banka hareketi gerçekten var ve tutar hakedişin net tutarıyla eşleşiyor (P0: bank_transaction_id NULL olamaz)
      const [bt] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, result.bankTransactionId));
      expect(bt).toBeTruthy();
      expect(bt!.amount).toBe('1590.0000');
      expect(bt!.status).toBe('matched');

      // Tahsilat gerçekten posted, o banka hareketiyle eşleşmiş VE faturaya allocate edilmiş (I9 — cari
      // bakiyesi yalnızca allocate edilen tutarla düşer, "on-account" bırakılmaz)
      const [pay] = await tx.select().from(payments).where(eq(payments.id, result.paymentId));
      expect(pay).toBeTruthy();
      expect(pay!.status).toBe('posted');
      expect(pay!.bankTransactionId).toBe(result.bankTransactionId);
      expect(pay!.amount).toBe('1590.0000');
      expect(pay!.unallocatedAmount).toBe('0.0000');

      const [invAfter] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(invAfter!.residual).toBe('430.0000'); // 2020 - 1590 tahsis edildi, kalan 430 hâlâ açık
      expect(invAfter!.status).toBe('partially_paid');

      // I17 (tur 15 P1 regresyon): markChannelSettlementPaid'in doğrudan oluşturduğu reconciliation_matches
      // satırı da kendi kayıt-bazlı audit_log kaydına sahip olmalı (bankReconciliation.ts ile aynı örüntü).
      const [settlementMatch] = await tx.select().from(reconciliationMatches).where(eq(reconciliationMatches.bankTransactionId, result.bankTransactionId));
      expect(settlementMatch).toBeTruthy();
      const settlementMatchAudits = await tx.select().from(auditLog).where(eq(auditLog.recordId, settlementMatch!.id));
      expect(settlementMatchAudits).toHaveLength(1);
      expect(settlementMatchAudits[0]!.tableName).toBe('reconciliation_matches');
      expect(settlementMatchAudits[0]!.action).toBe('create');

      // İdempotent: tekrar çağrılırsa aynı sonucu döner, ikinci bir tahsilat/banka hareketi üretmez
      const again = await markChannelSettlementPaid(tx, settlement.id, { paymentDate: today(), bankAccountId: bank.id }, ctx);
      expect(again.bankTransactionId).toBe(result.bankTransactionId);
      expect(again.paymentId).toBe('');
    });
  });

  it('gelecek tarihli ödeme reddedilir (henüz gerçekleşmemiş ödeme "ödendi" işaretlenemez)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const channel = await seedMarketplaceChannel(tx, b);
      const bank = await seedBankAccount(tx, b);
      await stockFinished(tx, b, 'PL-SETL-3', '30');
      await createInvoicedOrder(tx, b, channel.id, 5, 200);
      const settlement = await createChannelSettlement(tx, { channelId: channel.id, periodStart: today(), periodEnd: today() }, ctx);

      const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const err = await expectReject(tx, (sp) => markChannelSettlementPaid(sp, settlement.id, { paymentDate: future, bankAccountId: bank.id }, ctx));
      expect((err as Error).message).toMatch(/gelecekte olamaz/);
    });
  });

  it('açık fatura bakiyesi hakediş tutarını karşılamıyorsa reddedilir (on-account bırakmak yerine hata)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const channel = await seedMarketplaceChannel(tx, b);
      const bank = await seedBankAccount(tx, b);
      await stockFinished(tx, b, 'PL-SETL-5', '30');
      const { invoice } = await createInvoicedOrder(tx, b, channel.id, 10, 200);
      const settlement = await createChannelSettlement(tx, { channelId: channel.id, periodStart: today(), periodEnd: today() }, ctx);

      // Faturanın büyük kısmını başka bir kanaldan bağımsız şekilde önceden tahsil edilmiş varsayalım
      // (elle residual düşürülerek simüle edilir) — kalan açık bakiye artık hakediş tutarından az.
      await tx.update(invoices).set({ residual: '5.0000', paidAmount: '2015.0000', status: 'partially_paid' }).where(eq(invoices.id, invoice.id));

      const err = await expectReject(tx, (sp) => markChannelSettlementPaid(sp, settlement.id, { paymentDate: today(), bankAccountId: bank.id }, ctx));
      expect((err as Error).message).toMatch(/açık fatura bakiyesi hakediş tutarını karşılamıyor/);
    });
  });

  it('kanala bağlı cari yoksa DomainError fırlatır (para havada kalıp sessizce yutulmaz)', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await ensureJournals(tx);
      const [channel] = await tx.insert(salesChannels).values({ code: `MKT2-${b.s}`, name: `Pazaryeri2 ${b.s}`, kind: 'marketplace', commissionPct: '20' }).returning();
      const bank = await seedBankAccount(tx, b);
      await stockFinished(tx, b, 'PL-SETL-4', '30');
      await createInvoicedOrder(tx, b, channel!.id, 5, 200);
      const settlement = await createChannelSettlement(tx, { channelId: channel!.id, periodStart: today(), periodEnd: today() }, ctx);

      const err = await expectReject(tx, (sp) => markChannelSettlementPaid(sp, settlement.id, { paymentDate: today(), bankAccountId: bank.id }, ctx));
      expect((err as Error).message).toMatch(/kanalına bağlı cari tanımlı değil/);
    });
  });
});

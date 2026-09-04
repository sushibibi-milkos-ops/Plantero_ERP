import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { channelSettlements, salesChannels, salesOrders, bankAccounts, bankTransactions, reconciliationMatches, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { getChannelPartner } from './channels.js';
import { recordPayment, getOpenInvoicesForPartner } from '../finance/payments.js';
import { importStatement } from '../finance/bankReconciliation.js';
import { writeAudit } from '../audit/index.js';
import type { ActorCtx } from '../types.js';

/**
 * Kanal hakedişi (channel_settlements) — Tur 11 P0 düzeltmesi (docs/DESIGN-SCORECARD.md).
 *
 * ÖNCEKİ DURUM: `channel_settlements.gross_sales` seed'de sabit demo rakamları taşıyordu, aynı seed'in
 * ürettiği gerçek `sales_orders` toplamlarından kopuktu; `status='paid'` bir kayıt `bank_transaction_id`
 * olmadan "ödendi" işaretlenmişti (bankada/muhasebede hiçbir izi yoktu).
 *
 * BU DOSYA iki şeyi düzeltir:
 *  1. `computeSettlementTotals` — hakediş tutarlarını UYDURMAK yerine o kanalın o dönemdeki GERÇEK
 *     `sales_orders` toplamlarından hesaplar (aynı formül `getChannelRevenue` ile — bkz. channels.ts —
 *     ama tek kanala/döneme daraltılmış; kur farkı olan siparişler kendi `exchangeRate`'i ile TL'ye çevrilir).
 *  2. `markChannelSettlementPaid` — hakedişi "ödendi" işaretlemenin TEK yolu. Muhasebe/banka disiplini
 *     finans modülüyle AYNI servisler üzerinden kurulur (`finance/bankReconciliation.ts::importStatement`
 *     ile önce gerçek bir banka hareketi satırı açılır, sonra `finance/payments.ts::recordPayment` ile
 *     kanalın bağlı carisine (bkz. `getChannelPartner`) tahsilat işlenir ve o banka hareketiyle eşleştirilir)
 *     — böylece `channel_settlements.bank_transaction_id` her zaman gerçek bir `bank_transactions` satırına,
 *     `paid_at` her zaman gerçekleşmiş (bugünden ileri olmayan) bir ödeme tarihine işaret eder.
 *
 * Bu dosya `channel_settlements` tablosuna YAZAN tek core servisidir; ekranlar/seed buradan geçer.
 */

/**
 * Yalnızca FATURALANMIŞ siparişler (`invoiced`/`closed`) — bir hakediş, muhasebede henüz gelir/alacak
 * yazılmamış (confirmed/delivered ama faturasız) bir sipariş için hiçbir zaman ödenemez: `120` cari
 * hesabında karşılığı olmayan bir tutarı "tahsil edildi" yazmak I9 (cari bakiye) değişmezini bozar
 * (bkz. `markChannelSettlementPaid` — netPayout, carinin AÇIK FATURA bakiyesine tam allocate edilir).
 */
const SETTLEABLE_STATUSES = ['invoiced', 'closed'] as const;

export type SettlementTotals = {
  orderCount: number;
  grossSales: Decimal;
  commissions: Decimal;
  shippingDeductions: Decimal;
  otherDeductions: Decimal;
  netPayout: Decimal;
};

/** Bir kanalın bir dönemdeki GERÇEK sipariş toplamları (taslak/iptal hariç, TL karşılığı). */
export async function computeSettlementTotals(tx: DbOrTx, channelId: string, periodStart: string, periodEnd: string): Promise<SettlementTotals> {
  const [row] = await tx
    .select({
      orderCount: sql<string>`count(*)`,
      grossSales: sql<string>`coalesce(sum(${salesOrders.grandTotal}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      commissions: sql<string>`coalesce(sum(${salesOrders.commissionAmount}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      shippingDeductions: sql<string>`coalesce(sum(${salesOrders.shippingDeduction}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      otherDeductions: sql<string>`coalesce(sum(${salesOrders.otherDeduction}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
      netPayout: sql<string>`coalesce(sum(${salesOrders.netRevenue}::numeric * ${salesOrders.exchangeRate}::numeric), 0)`,
    })
    .from(salesOrders)
    .where(
      and(
        eq(salesOrders.channelId, channelId),
        eq(salesOrders.docType, 'order'),
        gte(salesOrders.orderDate, periodStart),
        lte(salesOrders.orderDate, periodEnd),
        inArray(salesOrders.status, SETTLEABLE_STATUSES),
      ),
    );
  const r = row!;
  return {
    orderCount: Number(r.orderCount),
    grossSales: round4(D(r.grossSales)),
    commissions: round4(D(r.commissions)),
    shippingDeductions: round4(D(r.shippingDeductions)),
    otherDeductions: round4(D(r.otherDeductions)),
    netPayout: round4(D(r.netPayout)),
  };
}

export type CreateChannelSettlementInput = {
  channelId: string;
  periodStart: string;
  periodEnd: string;
  /** Kesintiler sonrası iadeler (varsayılan 0 — sipariş toplamlarından ayrı, elle girilir) */
  returns?: Decimal;
  expectedPayoutDate?: string | null;
};

/** Hakediş kaydı açar; tutarlar `computeSettlementTotals` ile o kanalın o dönemdeki gerçek sipariş toplamlarından hesaplanır. */
export async function createChannelSettlement(tx: DbOrTx, input: CreateChannelSettlementInput, ctx: ActorCtx): Promise<typeof channelSettlements.$inferSelect> {
  const [channel] = await tx.select().from(salesChannels).where(eq(salesChannels.id, input.channelId)).limit(1);
  if (!channel) throw new NotFoundError('Kanal', input.channelId);
  const periodStart = businessDate(input.periodStart);
  const periodEnd = businessDate(input.periodEnd);
  if (periodStart > periodEnd) throw new ValidationError('Dönem başlangıcı bitişten sonra olamaz', { periodStart, periodEnd });

  const totals = await computeSettlementTotals(tx, input.channelId, periodStart, periodEnd);
  const returns = round4(input.returns ?? ZERO);
  const netPayout = round4(totals.netPayout.minus(returns));

  const [row] = await tx
    .insert(channelSettlements)
    .values({
      channelId: input.channelId, periodStart, periodEnd,
      grossSales: toDb(totals.grossSales), commissions: toDb(totals.commissions), shippingDeductions: toDb(totals.shippingDeductions),
      otherDeductions: toDb(totals.otherDeductions), returns: toDb(returns), netPayout: toDb(netPayout),
      expectedPayoutDate: input.expectedPayoutDate ?? null, status: 'open', createdBy: ctx.userId ?? null,
    })
    .returning();
  return row!;
}

export type MarkChannelSettlementPaidInput = {
  /** Bankaya fiilen gireceği tarih — gelecek tarih kabul edilmez (I: henüz gerçekleşmemiş ödeme "ödendi" olamaz) */
  paymentDate: string | Date;
  bankAccountId: string;
  reference?: string | null;
};

export type MarkChannelSettlementPaidResult = {
  settlement: typeof channelSettlements.$inferSelect;
  paymentId: string;
  paymentDocNo: string;
  bankTransactionId: string;
};

/**
 * Hakedişi "ödendi" işaretlemenin TEK yolu. Önce bankaya düşen hareketi `importStatement` ile açar
 * (gerçek bir `bank_transactions` satırı — mutabakat ekranında da görünür), sonra kanalın bağlı
 * carisine (`getChannelPartner`) o banka hareketiyle eşleşen bir tahsilat (`recordPayment`) işler.
 * Zaten `paid` olan bir hakediş için idempotent (yeniden çağrılırsa mevcut kaydı olduğu gibi döner).
 */
export async function markChannelSettlementPaid(tx: DbOrTx, settlementId: string, input: MarkChannelSettlementPaidInput, ctx: ActorCtx): Promise<MarkChannelSettlementPaidResult> {
  const [settlement] = await tx.select().from(channelSettlements).where(eq(channelSettlements.id, settlementId)).for('update');
  if (!settlement) throw new NotFoundError('Kanal hakedişi', settlementId);
  if (settlement.status === 'paid') {
    if (!settlement.bankTransactionId) throw new DomainError('SETTLEMENT_PAID_WITHOUT_BANK_TX', `Hakediş zaten "ödendi" ama banka hareketi bağlı değil (${settlement.id}) — veri tutarsız, elle düzeltilmeli`);
    return { settlement, paymentId: '', paymentDocNo: '', bankTransactionId: settlement.bankTransactionId };
  }
  if (settlement.status === 'disputed') throw new DomainError('SETTLEMENT_DISPUTED', 'İtirazlı hakediş doğrudan ödendi işaretlenemez; önce itiraz kapatılmalı');

  const paymentDate = businessDate(input.paymentDate);
  const todayStr = businessDate(new Date());
  if (paymentDate > todayStr) throw new ValidationError('Hakediş ödeme tarihi gelecekte olamaz', { paymentDate, today: todayStr });

  const netPayout = D(settlement.netPayout);
  if (netPayout.lte(0)) throw new ValidationError('Net hakediş tutarı sıfır ya da negatif; ödendi işaretlenemez', { settlementId, netPayout: settlement.netPayout });

  const [channel] = await tx.select().from(salesChannels).where(eq(salesChannels.id, settlement.channelId)).limit(1);
  if (!channel) throw new NotFoundError('Kanal', settlement.channelId);
  const partner = await getChannelPartner(tx, settlement.channelId);
  if (!partner) throw new DomainError('CHANNEL_PARTNER_NOT_FOUND', `${channel.name} kanalına bağlı cari tanımlı değil; hakediş tahsilatı işlenemedi`, { channelId: channel.id });

  const [bankAccount] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, input.bankAccountId)).limit(1);
  if (!bankAccount) throw new NotFoundError('Banka hesabı', input.bankAccountId);
  if (bankAccount.currency !== channel.currency) {
    throw new ValidationError(`Banka hesabı para birimi (${bankAccount.currency}) kanal para birimiyle (${channel.currency}) uyuşmuyor`, { bankAccountId: bankAccount.id, channelId: channel.id });
  }

  // (I9) Tahsilat "on-account" (allocations: []) bırakılamaz: 120 cari bakiyesi hem `partners.balance`
  // hem yevmiye tarafında yalnızca FATURA'ya tahsis edilen tutarlarla düşer; allocate edilmeyen kısım
  // ledger'ı carinin açık fatura toplamından koparır. Bu yüzden netPayout, carinin açık faturalarına
  // (en eski vadeden başlayarak) TAM olarak allocate edilir — kısmı kalırsa (açık fatura bakiyesi
  // yetmiyorsa) işlem reddedilir; sessizce "on-account" bırakmak yerine veri/iş kuralı hatası verilir.
  const openInvoices = await getOpenInvoicesForPartner(tx, partner.id, 'inbound');
  let remaining = netPayout;
  const allocations: Array<{ invoiceId: string; amount: Decimal }> = [];
  for (const inv of openInvoices) {
    if (remaining.lte(0)) break;
    const residual = D(inv.residual);
    const take = residual.lt(remaining) ? residual : remaining;
    if (take.gt(0)) {
      allocations.push({ invoiceId: inv.id, amount: take });
      remaining = round4(remaining.minus(take));
    }
  }
  if (remaining.gt('0.0001')) {
    throw new DomainError(
      'SETTLEMENT_OPEN_INVOICE_SHORTFALL',
      `${channel.name} kanalına bağlı carinin (${partner.name}) açık fatura bakiyesi hakediş tutarını karşılamıyor: ${toDb(netPayout.minus(remaining))} / ${toDb(netPayout)} allocate edilebildi, ${toDb(remaining)} kaldı`,
      { channelId: channel.id, partnerId: partner.id, netPayout: toDb(netPayout), shortfall: toDb(remaining) },
    );
  }

  const externalRef = `SETTLE-${settlement.id}`;
  const reference = input.reference ?? `${channel.name} hakedişi ${settlement.periodStart}–${settlement.periodEnd}`;
  await importStatement(tx, {
    bankAccountId: bankAccount.id, source: 'manual',
    lines: [{ externalRef, txDate: paymentDate, amount: netPayout, currency: channel.currency, description: reference, counterpartyName: channel.name }],
  }, ctx);
  const [bt] = await tx.select().from(bankTransactions).where(and(eq(bankTransactions.bankAccountId, bankAccount.id), eq(bankTransactions.externalRef, externalRef))).limit(1);
  if (!bt) throw new DomainError('BANK_TX_NOT_CREATED', 'Hakediş banka hareketi oluşturulamadı');

  const { payment } = await recordPayment(tx, {
    direction: 'inbound', method: 'bank_transfer', partnerId: partner.id, bankAccountId: bankAccount.id, bankTransactionId: bt.id,
    paymentDate, currency: channel.currency, amount: netPayout, allocations, reference,
    note: `Kanal hakedişi ${channel.name} ${settlement.periodStart}–${settlement.periodEnd}`, origin: 'manual',
  }, ctx);

  // (I11c/I29) `bt.status='matched'` yalnızca onaylı/otomatik bir `reconciliation_matches` kaydı varsa
  // geçerli sayılır (mutabakat ekranındaki AYNI değişmez) — `kind='marketplace_payout'` (birden çok
  // faturaya bölünmüş TEK kanal hakedişi, `kind='invoice'`in varsaydığı 1 hareket↔1 fatura eşleşmesinden
  // farklı bir tür — reconMatchKindEnum bunun için ayrı tanımlı).
  const [matchRow] = await tx
    .insert(reconciliationMatches)
    .values({
      bankTransactionId: bt.id, kind: 'marketplace_payout', status: 'approved', partnerId: partner.id,
      invoiceIds: allocations.map((a) => a.invoiceId),
      allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: toDb(a.amount) })),
      confidence: toDb(1), rationale: `Kanal hakedişi: ${channel.name} ${settlement.periodStart}–${settlement.periodEnd}`,
      source: 'system', decidedBy: ctx.userId ?? null, decidedAt: new Date(), paymentId: payment.id,
    })
    .returning({ id: reconciliationMatches.id });
  // (I17, tur 15 P1 kök neden — bankReconciliation.ts ile aynı örüntü) Kanal hakedişinin ürettiği
  // reconciliation_matches satırı da kendi kayıt-bazlı audit izini burada bırakır.
  await writeAudit(tx, {
    action: 'create',
    tableName: 'reconciliation_matches',
    recordId: matchRow!.id,
    summary: `Kanal hakedişi mutabakatı: ${channel.name} ${settlement.periodStart}–${settlement.periodEnd} → tahsilat ${payment.docNo}`,
    after: { bankTransactionId: bt.id, partnerId: partner.id, kind: 'marketplace_payout', status: 'approved', source: 'system', paymentId: payment.id },
  }, ctx);

  const [updated] = await tx
    .update(channelSettlements)
    .set({ status: 'paid', paidAt: paymentDate, bankTransactionId: bt.id, updatedBy: ctx.userId ?? null })
    .where(eq(channelSettlements.id, settlement.id))
    .returning();

  return { settlement: updated!, paymentId: payment.id, paymentDocNo: payment.docNo, bankTransactionId: bt.id };
}

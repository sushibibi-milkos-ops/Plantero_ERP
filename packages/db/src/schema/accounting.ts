import { pgTable, text, uuid, boolean, integer, date, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, rate, note, meta } from './_common.js';
import { products, partners, salesChannels, uoms, warehouses } from './masterdata.js';
import { users } from './core.js';
import { documentOriginEnum } from './documents.js';

/* ------------------------------------------------------------------ */
/* Hesap planı — Tek Düzen (VUK) + UFRS eşlemesi; çift defter           */
/* ------------------------------------------------------------------ */

export const ledgerEnum = pgEnum('ledger', ['VUK', 'UFRS']);
export const accountTypeEnum = pgEnum('account_type', ['asset', 'liability', 'equity', 'income', 'expense', 'cogs', 'off_balance']);

export const accounts = pgTable('accounts', {
  id: id(),
  code: text('code').notNull(), // 100, 102.01, 120.001, 150, 152, 191, 391, 600.01 ...
  name: text('name').notNull(),
  type: accountTypeEnum('type').notNull(),
  parentCode: text('parent_code'),
  level: integer('level').notNull().default(1),
  isPostable: boolean('is_postable').notNull().default(true),
  /** Cari alt hesabı mı (120/320 altı) */
  isPartnerAccount: boolean('is_partner_account').notNull().default(false),
  partnerId: uuid('partner_id').references(() => partners.id),
  /** UFRS'de karşılık gelen kod (aynıysa null) */
  ifrsCode: text('ifrs_code'),
  ifrsName: text('ifrs_name'),
  currency: text('currency').notNull().default('TRY'),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (t) => [uniqueIndex('accounts_code_uq').on(t.code), index('accounts_type_idx').on(t.type), index('accounts_partner_idx').on(t.partnerId)]);

export const fiscalPeriods = pgTable('fiscal_periods', {
  id: id(),
  code: text('code').notNull(), // 2026-09
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isClosed: boolean('is_closed').notNull().default(false),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => users.id),
}, (t) => [uniqueIndex('fiscal_periods_code_uq').on(t.code)]);

export const journalKindEnum = pgEnum('journal_kind', ['general', 'sales', 'purchase', 'bank', 'cash', 'stock', 'production', 'fx', 'payroll', 'closing']);

export const journals = pgTable('journals', {
  id: id(),
  code: text('code').notNull(), // GEN, SAT, ALS, BNK, KAS, STK, URT, KUR
  name: text('name').notNull(),
  kind: journalKindEnum('kind').notNull(),
  defaultAccountCode: text('default_account_code'),
  ...auditColumns,
}, (t) => [uniqueIndex('journals_code_uq').on(t.code)]);

export const journalEntryStatusEnum = pgEnum('journal_entry_status', ['draft', 'posted', 'reversed', 'cancelled']);

/** Yevmiye fişi — her fiş bir deftere aittir; stok/satış/alış olayları iki deftere de düşer */
export const journalEntries = pgTable('journal_entries', {
  id: id(),
  docNo: text('doc_no').notNull(), // JE-2026-000001
  ledger: ledgerEnum('ledger').notNull(),
  journalId: uuid('journal_id').notNull().references(() => journals.id),
  status: journalEntryStatusEnum('status').notNull().default('posted'),
  entryDate: date('entry_date').notNull(),
  periodId: uuid('period_id').references(() => fiscalPeriods.id),
  description: text('description').notNull(),
  /** Kaynak belge (polimorfik): stock_move, invoice, payment, bank_transaction, work_order, fx, manual */
  refType: text('ref_type'),
  refId: uuid('ref_id'),
  refNo: text('ref_no'),
  partnerId: uuid('partner_id').references(() => partners.id),
  currency: text('currency').notNull().default('TRY'),
  exchangeRate: rate('exchange_rate').notNull().default('1'),
  totalDebit: money('total_debit').notNull().default('0'),
  totalCredit: money('total_credit').notNull().default('0'),
  /** İkiz fiş (diğer defterdeki karşılığı) */
  twinEntryId: uuid('twin_entry_id'),
  reversedById: uuid('reversed_by_id'),
  reversesId: uuid('reverses_id'),
  origin: documentOriginEnum('origin').notNull().default('chain'),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
  postedBy: uuid('posted_by').references(() => users.id),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('journal_entries_docno_uq').on(t.docNo), index('journal_entries_ledger_date_idx').on(t.ledger, t.entryDate), index('journal_entries_ref_idx').on(t.refType, t.refId), index('journal_entries_partner_idx').on(t.partnerId)]);

export const journalLines = pgTable('journal_lines', {
  id: id(),
  entryId: uuid('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  ledger: ledgerEnum('ledger').notNull(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  accountCode: text('account_code').notNull(),
  partnerId: uuid('partner_id').references(() => partners.id),
  description: text('description'),
  debit: money('debit').notNull().default('0'),
  credit: money('credit').notNull().default('0'),
  /** Döviz */
  currency: text('currency').notNull().default('TRY'),
  amountCurrency: money('amount_currency'),
  /** Mutabakat (cari/banka hesapları için) */
  isReconciled: boolean('is_reconciled').notNull().default(false),
  matchingNo: text('matching_no'),
  residual: money('residual'),
  dueDate: date('due_date'),
  /** Analitik boyutlar */
  productId: uuid('product_id').references(() => products.id),
  channelId: uuid('channel_id').references(() => salesChannels.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  costCenter: text('cost_center'),
  sequence: integer('sequence').notNull().default(10),
}, (t) => [index('journal_lines_entry_idx').on(t.entryId), index('journal_lines_account_idx').on(t.accountCode, t.ledger), index('journal_lines_partner_idx').on(t.partnerId, t.isReconciled)]);

/* ------------------------------------------------------------------ */
/* Vergiler                                                            */
/* ------------------------------------------------------------------ */

export const taxes = pgTable('taxes', {
  id: id(),
  code: text('code').notNull(), // KDV1, KDV10, KDV20, KDV0, STOPAJ20
  name: text('name').notNull(),
  ratePct: qty('rate_pct').notNull(),
  scope: text('scope').notNull(), // sale, purchase, both
  /** Hesaplanan KDV 391, indirilecek KDV 191 */
  accountCode: text('account_code').notNull(),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [uniqueIndex('taxes_code_uq').on(t.code)]);

/** Aylık KDV beyan özeti: devreden KDV takibi (%1 satış / %20 alış) */
export const vatPeriods = pgTable('vat_periods', {
  id: id(),
  period: text('period').notNull(), // 2026-09
  outputVat: money('output_vat').notNull().default('0'),   // hesaplanan (391)
  inputVat: money('input_vat').notNull().default('0'),     // indirilecek (191)
  carriedFromPrev: money('carried_from_prev').notNull().default('0'), // önceki dönemden devreden (190)
  payable: money('payable').notNull().default('0'),        // ödenecek (360)
  carriedToNext: money('carried_to_next').notNull().default('0'),     // sonraki döneme devreden
  status: text('status').notNull().default('open'), // open, declared, paid
  declaredAt: date('declared_at'),
  journalEntryId: uuid('journal_entry_id'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('vat_periods_period_uq').on(t.period)]);

/* ------------------------------------------------------------------ */
/* Faturalar (satış + alış + iade)                                     */
/* ------------------------------------------------------------------ */

export const invoiceKindEnum = pgEnum('invoice_kind', ['sales', 'purchase', 'sales_return', 'purchase_return']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'posted', 'partially_paid', 'paid', 'cancelled']);
export const eInvoiceTypeEnum = pgEnum('e_invoice_type', ['none', 'e_fatura', 'e_arsiv', 'export']);
export const eInvoiceStatusEnum = pgEnum('e_invoice_status', ['not_sent', 'queued', 'sent', 'accepted', 'rejected', 'error']);

export const invoices = pgTable('invoices', {
  id: id(),
  docNo: text('doc_no').notNull(), // INV-2026-000001 (satış) / PINV (alış)
  kind: invoiceKindEnum('kind').notNull(),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  partnerId: uuid('partner_id').notNull().references(() => partners.id),
  channelId: uuid('channel_id').references(() => salesChannels.id),
  salesOrderId: uuid('sales_order_id'),
  purchaseOrderId: uuid('purchase_order_id'),
  deliveryId: uuid('delivery_id'),
  receiptId: uuid('receipt_id'),
  /** Tedarikçi fatura no (alış) */
  supplierInvoiceNo: text('supplier_invoice_no'),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date').notNull(),
  currency: text('currency').notNull().default('TRY'),
  exchangeRate: rate('exchange_rate').notNull().default('1'),
  subtotal: money('subtotal').notNull().default('0'),
  discountTotal: money('discount_total').notNull().default('0'),
  vatTotal: money('vat_total').notNull().default('0'),
  grandTotal: money('grand_total').notNull().default('0'),
  /** TL karşılığı (dövizli faturada) */
  grandTotalTry: money('grand_total_try').notNull().default('0'),
  paidAmount: money('paid_amount').notNull().default('0'),
  residual: money('residual').notNull().default('0'),
  /** e-Belge (Bizimhesap) */
  eInvoiceType: eInvoiceTypeEnum('e_invoice_type').notNull().default('none'),
  eInvoiceStatus: eInvoiceStatusEnum('e_invoice_status').notNull().default('not_sent'),
  eInvoiceUuid: text('e_invoice_uuid'),
  eInvoiceNo: text('e_invoice_no'), // GİB numarası
  eInvoiceSentAt: timestamp('e_invoice_sent_at', { withTimezone: true }),
  eInvoiceError: text('e_invoice_error'),
  /** Muhasebe */
  journalEntryId: uuid('journal_entry_id'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  postedBy: uuid('posted_by').references(() => users.id),
  /** İhracat */
  isExport: boolean('is_export').notNull().default(false),
  exportShipmentId: uuid('export_shipment_id'),
  /** Tahsilat takibi */
  dunningLevel: integer('dunning_level').notNull().default(0),
  lastDunningAt: timestamp('last_dunning_at', { withTimezone: true }),
  origin: documentOriginEnum('origin').notNull().default('chain'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('invoices_docno_uq').on(t.docNo), index('invoices_partner_idx').on(t.partnerId, t.status), index('invoices_kind_date_idx').on(t.kind, t.invoiceDate), index('invoices_due_idx').on(t.dueDate, t.status), index('invoices_so_idx').on(t.salesOrderId), index('invoices_delivery_idx').on(t.deliveryId)]);

export const invoiceLines = pgTable('invoice_lines', {
  id: id(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  description: text('description').notNull(),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').references(() => uoms.id),
  unitPrice: money('unit_price').notNull(),
  discountPct: qty('discount_pct').notNull().default('0'),
  vatRate: qty('vat_rate').notNull().default('1'),
  lineSubtotal: money('line_subtotal').notNull().default('0'),
  lineVat: money('line_vat').notNull().default('0'),
  lineTotal: money('line_total').notNull().default('0'),
  /** Zincir */
  salesOrderLineId: uuid('sales_order_line_id'),
  deliveryLineId: uuid('delivery_line_id'),
  purchaseOrderLineId: uuid('purchase_order_line_id'),
  receiptLineId: uuid('receipt_line_id'),
  lotId: uuid('lot_id'),
  /** SMM (COGS) — sevk edilen lot maliyeti */
  cogsAmount: money('cogs_amount').notNull().default('0'),
  accountCode: text('account_code'),
  sequence: integer('sequence').notNull().default(10),
}, (t) => [index('invoice_lines_invoice_idx').on(t.invoiceId), index('invoice_lines_so_line_idx').on(t.salesOrderLineId), index('invoice_lines_delivery_line_idx').on(t.deliveryLineId)]);

/* ------------------------------------------------------------------ */
/* Tahsilat / ödeme + fatura eşleme                                    */
/* ------------------------------------------------------------------ */

export const paymentDirectionEnum = pgEnum('payment_direction', ['inbound', 'outbound']);
export const paymentMethodEnum = pgEnum('payment_method', ['bank_transfer', 'cash', 'credit_card', 'cheque', 'marketplace_payout', 'other']);
export const paymentStatusEnum = pgEnum('payment_status', ['draft', 'posted', 'cancelled']);

export const payments = pgTable('payments', {
  id: id(),
  docNo: text('doc_no').notNull(), // PAY-2026-000001
  direction: paymentDirectionEnum('direction').notNull(),
  method: paymentMethodEnum('method').notNull().default('bank_transfer'),
  status: paymentStatusEnum('status').notNull().default('posted'),
  partnerId: uuid('partner_id').notNull().references(() => partners.id),
  bankAccountId: uuid('bank_account_id'),
  bankTransactionId: uuid('bank_transaction_id'),
  paymentDate: date('payment_date').notNull(),
  currency: text('currency').notNull().default('TRY'),
  exchangeRate: rate('exchange_rate').notNull().default('1'),
  amount: money('amount').notNull(),
  amountTry: money('amount_try').notNull(),
  allocatedAmount: money('allocated_amount').notNull().default('0'),
  unallocatedAmount: money('unallocated_amount').notNull().default('0'),
  journalEntryId: uuid('journal_entry_id'),
  /** Kur farkı fişi (dövizli tahsilat) */
  fxJournalEntryId: uuid('fx_journal_entry_id'),
  fxDifference: money('fx_difference').notNull().default('0'),
  reference: text('reference'),
  origin: documentOriginEnum('origin').notNull().default('manual'),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('payments_docno_uq').on(t.docNo), index('payments_partner_idx').on(t.partnerId, t.paymentDate), index('payments_bank_tx_idx').on(t.bankTransactionId)]);

export const paymentAllocations = pgTable('payment_allocations', {
  id: id(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  amount: money('amount').notNull(),
  amountTry: money('amount_try').notNull(),
  allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('payment_allocations_payment_idx').on(t.paymentId), index('payment_allocations_invoice_idx').on(t.invoiceId)]);

/* ------------------------------------------------------------------ */
/* Banka hesapları, hareketler, ekstre importu, AI mutabakat            */
/* ------------------------------------------------------------------ */

export const bankAccounts = pgTable('bank_accounts', {
  id: id(),
  code: text('code').notNull(),
  bankName: text('bank_name').notNull(), // Vakıfbank, QNB, ...
  branch: text('branch'),
  iban: text('iban'),
  accountNo: text('account_no'),
  currency: text('currency').notNull().default('TRY'),
  /** 102.xx muhasebe hesabı */
  accountCode: text('account_code').notNull(),
  /** Açık bankacılık */
  connectorKind: text('connector_kind').notNull().default('manual'), // open_banking, mt940, csv, manual
  connectorConfig: jsonb('connector_config').$type<Record<string, unknown>>().default({}),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  /** Son bilinen bakiye (ekstre) */
  statementBalance: money('statement_balance').notNull().default('0'),
  statementBalanceAt: timestamp('statement_balance_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  ...auditColumns,
}, (t) => [uniqueIndex('bank_accounts_code_uq').on(t.code)]);

export const bankStatementImports = pgTable('bank_statement_imports', {
  id: id(),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  source: text('source').notNull(), // open_banking, mt940, csv, manual
  fileName: text('file_name'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  openingBalance: money('opening_balance'),
  closingBalance: money('closing_balance'),
  lineCount: integer('line_count').notNull().default(0),
  importedCount: integer('imported_count').notNull().default(0),
  duplicateCount: integer('duplicate_count').notNull().default(0),
  status: text('status').notNull().default('done'),
  error: text('error'),
  ...auditColumns,
}, (t) => [index('bank_statement_imports_account_idx').on(t.bankAccountId)]);

export const bankTxStatusEnum = pgEnum('bank_tx_status', ['unmatched', 'suggested', 'matched', 'ignored']);

export const bankTransactions = pgTable('bank_transactions', {
  id: id(),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  importId: uuid('import_id').references(() => bankStatementImports.id),
  /** Banka tarafı benzersiz referans (çift import engeli) */
  externalRef: text('external_ref').notNull(),
  txDate: date('tx_date').notNull(),
  valueDate: date('value_date'),
  amount: money('amount').notNull(), // + giriş / − çıkış
  currency: text('currency').notNull().default('TRY'),
  balanceAfter: money('balance_after'),
  description: text('description').notNull(),
  counterpartyName: text('counterparty_name'),
  counterpartyIban: text('counterparty_iban'),
  txType: text('tx_type'), // transfer, eft, havale, pos, fee, loan_installment, marketplace_payout, tax
  status: bankTxStatusEnum('status').notNull().default('unmatched'),
  /** Eşleşme sonucu */
  matchedPartnerId: uuid('matched_partner_id').references(() => partners.id),
  matchedPaymentId: uuid('matched_payment_id'),
  matchedInvoiceId: uuid('matched_invoice_id'),
  matchedExpenseAccountCode: text('matched_expense_account_code'),
  journalEntryId: uuid('journal_entry_id'),
  matchedAt: timestamp('matched_at', { withTimezone: true }),
  matchedBy: uuid('matched_by').references(() => users.id),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('bank_transactions_ext_uq').on(t.bankAccountId, t.externalRef), index('bank_transactions_status_idx').on(t.status, t.txDate), index('bank_transactions_date_idx').on(t.txDate)]);

export const reconMatchKindEnum = pgEnum('recon_match_kind', ['invoice', 'partner_on_account', 'loan_installment', 'expense', 'transfer', 'marketplace_payout', 'tax', 'fee', 'unknown']);
export const reconMatchStatusEnum = pgEnum('recon_match_status', ['suggested', 'auto_applied', 'approved', 'rejected', 'superseded']);

/** AI Mutabakat Ajanı önerileri ve kararları */
export const reconciliationMatches = pgTable('reconciliation_matches', {
  id: id(),
  bankTransactionId: uuid('bank_transaction_id').notNull().references(() => bankTransactions.id, { onDelete: 'cascade' }),
  kind: reconMatchKindEnum('kind').notNull(),
  status: reconMatchStatusEnum('status').notNull().default('suggested'),
  partnerId: uuid('partner_id').references(() => partners.id),
  /** Önerilen fatura(lar) ve tutar dağılımı */
  invoiceIds: jsonb('invoice_ids').$type<string[]>().default([]),
  allocations: jsonb('allocations').$type<Array<{ invoiceId: string; amount: string }>>().default([]),
  loanInstallmentId: uuid('loan_installment_id'),
  expenseAccountCode: text('expense_account_code'),
  /** 0-1 güven, eşleşme gerekçesi (fuzzy skorlar) */
  confidence: qty('confidence').notNull().default('0'),
  rationale: text('rationale'),
  features: jsonb('features').$type<Record<string, unknown>>().default({}),
  source: text('source').notNull().default('ai'), // ai, rule, learned, manual
  approvalId: uuid('approval_id'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  paymentId: uuid('payment_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('reconciliation_matches_tx_idx').on(t.bankTransactionId), index('reconciliation_matches_status_idx').on(t.status)]);

/** Onaylardan öğrenme: açıklama deseni → cari / hesap */
export const reconciliationLearnings = pgTable('reconciliation_learnings', {
  id: id(),
  pattern: text('pattern').notNull(), // normalize edilmiş açıklama parçası / IBAN
  patternKind: text('pattern_kind').notNull().default('description'), // description, iban, counterparty
  partnerId: uuid('partner_id').references(() => partners.id),
  expenseAccountCode: text('expense_account_code'),
  matchKind: reconMatchKindEnum('match_kind').notNull(),
  hits: integer('hits').notNull().default(1),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('reconciliation_learnings_pattern_idx').on(t.patternKind, t.pattern)]);

/* ------------------------------------------------------------------ */
/* Kur                                                                 */
/* ------------------------------------------------------------------ */

export const exchangeRates = pgTable('exchange_rates', {
  id: id(),
  currency: text('currency').notNull(), // USD, EUR, GBP
  rateDate: date('rate_date').notNull(),
  buying: rate('buying').notNull(),
  selling: rate('selling').notNull(),
  source: text('source').notNull().default('TCMB'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('exchange_rates_uq').on(t.currency, t.rateDate)]);

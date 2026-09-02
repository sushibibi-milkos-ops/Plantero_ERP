import { pgTable, text, uuid, boolean, integer, date, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, rate, note } from './_common.js';
import { partners, salesChannels } from './masterdata.js';
import { invoices, bankAccounts } from './accounting.js';
import { users } from './core.js';

/* ------------------------------------------------------------------ */
/* Krediler (7 kredi) ve taksit takvimi                                */
/* ------------------------------------------------------------------ */

export const loans = pgTable('loans', {
  id: id(),
  code: text('code').notNull(), // L1..L7
  bankName: text('bank_name').notNull(),
  productName: text('product_name').notNull(),
  reference: text('reference'),
  principal: money('principal').notNull(),
  currency: text('currency').notNull().default('TRY'),
  openedAt: date('opened_at').notNull(),
  termMonths: integer('term_months').notNull(),
  monthlyRatePct: rate('monthly_rate_pct').notNull(),
  rateKind: text('rate_kind').notNull().default('fixed'), // fixed, variable
  bsmvPct: rate('bsmv_pct').notNull().default('5'),
  monthlyInstallment: money('monthly_installment').notNull(),
  paymentDay: integer('payment_day').notNull(),
  firstRemainingDue: date('first_remaining_due'),
  lastDue: date('last_due'),
  remainingPrincipal: money('remaining_principal').notNull(),
  remainingInstallments: integer('remaining_installments').notNull(),
  bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id),
  /** 300/400 banka kredileri hesabı */
  accountCode: text('account_code'),
  interestAccountCode: text('interest_account_code').default('780'),
  isActive: boolean('is_active').notNull().default(true),
  note: note(),
  ...auditColumns,
}, (t) => [uniqueIndex('loans_code_uq').on(t.code)]);

export const loanInstallments = pgTable('loan_installments', {
  id: id(),
  loanId: uuid('loan_id').notNull().references(() => loans.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  dueDate: date('due_date').notNull(),
  period: text('period').notNull(), // 2026-09
  installment: money('installment').notNull(),
  interest: money('interest').notNull(), // faiz + BSMV
  principal: money('principal').notNull(),
  remainingAfter: money('remaining_after').notNull(),
  status: text('status').notNull().default('scheduled'), // scheduled, paid, overdue
  paidAt: date('paid_at'),
  bankTransactionId: uuid('bank_transaction_id'),
  journalEntryId: uuid('journal_entry_id'),
}, (t) => [uniqueIndex('loan_installments_uq').on(t.loanId, t.seq), index('loan_installments_due_idx').on(t.dueDate, t.status)]);

/* ------------------------------------------------------------------ */
/* Sabit giderler, nakit akışı varsayımları ve projeksiyon              */
/* ------------------------------------------------------------------ */

export const fixedExpenses = pgTable('fixed_expenses', {
  id: id(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(), // rent, personnel, energy, marketing, admin, finance, other
  monthlyAmount: money('monthly_amount').notNull(),
  includesVat: boolean('includes_vat').notNull().default(true),
  accountCode: text('account_code'),
  /** Yıllık artış % ve başlangıç */
  annualIncreasePct: qty('annual_increase_pct').notNull().default('0'),
  startPeriod: text('start_period'),
  endPeriod: text('end_period'),
  dayOfMonth: integer('day_of_month').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...auditColumns,
}, (t) => [uniqueIndex('fixed_expenses_code_uq').on(t.code)]);

/** Excel "Varsayımlar" sayfası — anahtar/değer */
export const cashflowAssumptions = pgTable('cashflow_assumptions', {
  key: text('key').primaryKey(), // opening_cash, corporate_tax_rate, cash_buffer, scenario_multiplier, monthly_growth_pct, fixed_cost_increase_pct, net_vat_pct
  value: qty('value').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Kanal bazlı ciro varsayımı (aylık ciro, katkı marjı, tahsilat vadesi) */
export const channelAssumptions = pgTable('channel_assumptions', {
  id: id(),
  channelId: uuid('channel_id').notNull().references(() => salesChannels.id),
  monthlyRevenue: money('monthly_revenue').notNull(),
  contributionMarginPct: qty('contribution_margin_pct').notNull(),
  collectionLagMonths: integer('collection_lag_months').notNull().default(0),
  source: text('source'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('channel_assumptions_channel_uq').on(t.channelId)]);

/** 36 aylık projeksiyon satırları (hesaplanmış + manuel override) */
export const cashflowLines = pgTable('cashflow_lines', {
  id: id(),
  period: text('period').notNull(), // 2026-09
  scenario: text('scenario').notNull().default('base'), // base, optimistic, pessimistic
  /** Gelirler */
  revenueByChannel: jsonb('revenue_by_channel').$type<Record<string, string>>().default({}),
  revenueTotal: money('revenue_total').notNull().default('0'),
  collections: money('collections').notNull().default('0'),
  variableCosts: money('variable_costs').notNull().default('0'),
  grossProfit: money('gross_profit').notNull().default('0'),
  fixedExpenses: money('fixed_expenses').notNull().default('0'),
  ebitda: money('ebitda').notNull().default('0'),
  loanInterest: money('loan_interest').notNull().default('0'),
  loanPrincipal: money('loan_principal').notNull().default('0'),
  corporateTax: money('corporate_tax').notNull().default('0'),
  netVat: money('net_vat').notNull().default('0'),
  otherInflows: money('other_inflows').notNull().default('0'),
  investments: money('investments').notNull().default('0'),
  netCashflow: money('net_cashflow').notNull().default('0'),
  closingCash: money('closing_cash').notNull().default('0'),
  /** Break-even: bu ay gereken minimum ciro (KDV hariç) */
  breakEvenRevenue: money('break_even_revenue').notNull().default('0'),
  /** Gerçekleşen (muhasebeden) — bütçe vs gerçekleşen */
  actualRevenue: money('actual_revenue'),
  actualCollections: money('actual_collections'),
  actualFixedExpenses: money('actual_fixed_expenses'),
  actualNetCashflow: money('actual_net_cashflow'),
  /** Manuel override alanları (Excel'deki mavi hücreler) */
  overrides: jsonb('overrides').$type<Record<string, string>>().default({}),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('cashflow_lines_uq').on(t.scenario, t.period)]);

/* ------------------------------------------------------------------ */
/* Bütçe                                                               */
/* ------------------------------------------------------------------ */

export const budgets = pgTable('budgets', {
  id: id(),
  year: integer('year').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'), // draft, approved
  ...auditColumns,
}, (t) => [uniqueIndex('budgets_year_name_uq').on(t.year, t.name)]);

export const budgetLines = pgTable('budget_lines', {
  id: id(),
  budgetId: uuid('budget_id').notNull().references(() => budgets.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  kind: text('kind').notNull(), // revenue, cogs, fixed_expense, capex, finance
  accountCode: text('account_code'),
  channelId: uuid('channel_id').references(() => salesChannels.id),
  label: text('label').notNull(),
  planned: money('planned').notNull().default('0'),
  actual: money('actual').notNull().default('0'),
  variance: money('variance').notNull().default('0'),
}, (t) => [index('budget_lines_budget_period_idx').on(t.budgetId, t.period)]);

/* ------------------------------------------------------------------ */
/* Tahmin (AI) ve tahsilat hatırlatmaları                              */
/* ------------------------------------------------------------------ */

export const forecasts = pgTable('forecasts', {
  id: id(),
  kind: text('kind').notNull(), // sales, cash, channel_sales
  period: text('period').notNull(),
  channelId: uuid('channel_id').references(() => salesChannels.id),
  predicted: money('predicted').notNull(),
  low: money('low'),
  high: money('high'),
  method: text('method').notNull().default('ai'), // ai, moving_average, seasonal
  rationale: text('rationale'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('forecasts_kind_period_idx').on(t.kind, t.period)]);

export const dunningRules = pgTable('dunning_rules', {
  id: id(),
  level: integer('level').notNull(), // 1: vade -3 gün nazik, 2: vade +3, 3: +15, 4: +30 ihtar
  name: text('name').notNull(),
  daysOffset: integer('days_offset').notNull(),
  channels: jsonb('channels').$type<string[]>().default(['email']), // email, whatsapp
  tone: text('tone').notNull().default('friendly'), // friendly, firm, formal, legal
  requiresApproval: boolean('requires_approval').notNull().default(true),
  templateHint: text('template_hint'),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [uniqueIndex('dunning_rules_level_uq').on(t.level)]);

export const dunningStatusEnum = pgEnum('dunning_status', ['draft', 'pending_approval', 'approved', 'sent', 'failed', 'cancelled']);

export const dunningActions = pgTable('dunning_actions', {
  id: id(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  partnerId: uuid('partner_id').notNull().references(() => partners.id),
  ruleId: uuid('rule_id').references(() => dunningRules.id),
  level: integer('level').notNull(),
  channel: text('channel').notNull(), // email, whatsapp
  status: dunningStatusEnum('status').notNull().default('draft'),
  /** AI taslak — kullanıcı düzenleyip onaylar */
  subject: text('subject'),
  body: text('body').notNull(),
  aiGenerated: boolean('ai_generated').notNull().default(true),
  approvalId: uuid('approval_id'),
  approvedBy: uuid('approved_by').references(() => users.id),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentTo: text('sent_to'),
  error: text('error'),
  ...auditColumns,
}, (t) => [index('dunning_actions_invoice_idx').on(t.invoiceId), index('dunning_actions_status_idx').on(t.status)]);

import { pgTable, text, uuid, boolean, integer, date, timestamp, index, uniqueIndex, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { id, auditColumns, money, qty, note, meta } from './_common.js';
import { products, uoms, boms } from './masterdata.js';
import { users } from './core.js';

export const rndProjectStatusEnum = pgEnum('rnd_project_status', ['idea', 'active', 'on_hold', 'completed', 'cancelled']);

export const rndProjects = pgTable('rnd_projects', {
  id: id(),
  code: text('code').notNull(), // RD-2026-001
  name: text('name').notNull(),
  status: rndProjectStatusEnum('status').notNull().default('active'),
  /** Mevcut ürün geliştirme ise ürün; yeni ürünse null (hedef SKU adayı) */
  productId: uuid('product_id').references(() => products.id),
  targetSku: text('target_sku'),
  ownerId: uuid('owner_id').references(() => users.id),
  goal: text('goal'),
  targetUnitCost: money('target_unit_cost'),
  targetLaunchDate: date('target_launch_date'),
  note: note(),
  meta: meta(),
  ...auditColumns,
}, (t) => [uniqueIndex('rnd_projects_code_uq').on(t.code)]);

/** Trello mantığı: proje başına board, özelleştirilebilir kolonlar */
export const rndBoardColumns = pgTable('rnd_board_columns', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => rndProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  position: integer('position').notNull().default(0),
  wipLimit: integer('wip_limit'),
  isDone: boolean('is_done').notNull().default(false),
}, (t) => [index('rnd_board_columns_project_idx').on(t.projectId, t.position)]);

export const rndCards = pgTable('rnd_cards', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => rndProjects.id, { onDelete: 'cascade' }),
  columnId: uuid('column_id').notNull().references(() => rndBoardColumns.id),
  title: text('title').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  assigneeId: uuid('assignee_id').references(() => users.id),
  dueDate: date('due_date'),
  labels: jsonb('labels').$type<string[]>().default([]),
  checklist: jsonb('checklist').$type<Array<{ text: string; done: boolean }>>().default([]),
  trialVersionId: uuid('trial_version_id'),
  isArchived: boolean('is_archived').notNull().default(false),
  ...auditColumns,
}, (t) => [index('rnd_cards_column_idx').on(t.columnId, t.position), index('rnd_cards_project_idx').on(t.projectId)]);

export const rndCardComments = pgTable('rnd_card_comments', {
  id: id(),
  cardId: uuid('card_id').notNull().references(() => rndCards.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('rnd_card_comments_card_idx').on(t.cardId)]);

export const trialStatusEnum = pgEnum('trial_status', ['draft', 'testing', 'approved', 'rejected', 'released']);

/** Deneme reçetesi (versiyonlu) + canlı maliyet simülasyonu */
export const trialRecipes = pgTable('trial_recipes', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => rndProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  currentVersionId: uuid('current_version_id'),
  ...auditColumns,
}, (t) => [index('trial_recipes_project_idx').on(t.projectId)]);

export const trialRecipeVersions = pgTable('trial_recipe_versions', {
  id: id(),
  recipeId: uuid('recipe_id').notNull().references(() => trialRecipes.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  status: trialStatusEnum('status').notNull().default('draft'),
  batchQty: qty('batch_qty').notNull().default('1'),
  batchUomId: uuid('batch_uom_id').references(() => uoms.id),
  expectedYieldPct: qty('expected_yield_pct').notNull().default('100'),
  overheadPerBatch: money('overhead_per_batch').notNull().default('0'),
  overheadPerUnit: money('overhead_per_unit').notNull().default('0'),
  /** Simülasyon çıktısı (kaydedilen son hesap) */
  materialCost: money('material_cost').notNull().default('0'),
  unitCost: money('unit_cost').notNull().default('0'),
  /** Duyusal / analiz sonuçları */
  results: jsonb('results').$type<Record<string, unknown>>().default({}),
  changeNote: text('change_note'),
  /** Onaylanıp üretim BOM'una devrolduysa */
  releasedBomId: uuid('released_bom_id').references(() => boms.id),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  releasedBy: uuid('released_by').references(() => users.id),
  approvalId: uuid('approval_id'),
  ...auditColumns,
}, (t) => [uniqueIndex('trial_recipe_versions_uq').on(t.recipeId, t.version)]);

export const trialRecipeLines = pgTable('trial_recipe_lines', {
  id: id(),
  versionId: uuid('version_id').notNull().references(() => trialRecipeVersions.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  qty: qty('qty').notNull(),
  uomId: uuid('uom_id').notNull().references(() => uoms.id),
  /** Simülasyonda kullanılan birim maliyet (son alış / ortalama / manuel) */
  unitCost: money('unit_cost').notNull().default('0'),
  costSource: text('cost_source').notNull().default('average'), // average, last_purchase, manual
  scrapPct: qty('scrap_pct').notNull().default('0'),
  sequence: integer('sequence').notNull().default(10),
  note: note(),
}, (t) => [index('trial_recipe_lines_version_idx').on(t.versionId)]);

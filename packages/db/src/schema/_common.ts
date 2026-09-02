import { sql } from 'drizzle-orm';
import { numeric, timestamp, uuid, text, jsonb } from 'drizzle-orm/pg-core';

/** Birincil anahtar: uuid, veritabanı tarafında üretilir */
export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

/** Para ve miktar: numeric(18,4) — uygulama tarafında string, decimal.js ile hesaplanır */
export const money = (name: string) => numeric(name, { precision: 18, scale: 4 });
export const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });
export const rate = (name: string) => numeric(name, { precision: 12, scale: 6 });

/** Standart denetim kolonları: her tabloda */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

export const meta = () => jsonb('meta').$type<Record<string, unknown>>().default({});
export const note = () => text('note');

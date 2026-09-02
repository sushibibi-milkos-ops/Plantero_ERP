import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';

const globalForDb = globalThis as unknown as { __planteroSql?: ReturnType<typeof postgres> };
export const sql = globalForDb.__planteroSql ?? postgres(url, { max: 20, prepare: false, onnotice: () => {} });
if (process.env.NODE_ENV !== 'production') globalForDb.__planteroSql = sql;

export const db = drizzle(sql, { schema, casing: 'snake_case' });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
export { schema };

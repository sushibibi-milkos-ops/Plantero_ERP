import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';

/**
 * İş takvimi saat dilimi. Zaman damgaları UTC `timestamptz` olarak saklanır (CLAUDE.md kural 4) — bu
 * ayar saklanan anı DEĞİŞTİRMEZ; yalnızca oturumun `CURRENT_DATE` / `now()::date` türetimini
 * `packages/core/src/dates.ts::businessDate` ile aynı takvim gününe (Europe/Istanbul) hizalar. Aksi halde
 * UTC 21:00–24:00 aralığında uygulama "bugün"ü 05'i sayarken Postgres 04'ü sayıyor, I33 (gelecek tarihli
 * nakit olayı) ve "bugün vadesi geçen" sorguları günde üç saat boyunca yanlış sonuç veriyordu.
 */
export const BUSINESS_TZ = 'Europe/Istanbul';

const globalForDb = globalThis as unknown as { __planteroSql?: ReturnType<typeof postgres> };
export const sql =
  globalForDb.__planteroSql ??
  postgres(url, { max: 20, prepare: false, onnotice: () => {}, connection: { TimeZone: BUSINESS_TZ } });
if (process.env.NODE_ENV !== 'production') globalForDb.__planteroSql = sql;

export const db = drizzle(sql, { schema, casing: 'snake_case' });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
export { schema };

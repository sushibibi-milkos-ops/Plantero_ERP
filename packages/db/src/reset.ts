import 'dotenv/config';
import postgres from 'postgres';
const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const sql = postgres(url, { max: 1 });
await sql`DROP SCHEMA public CASCADE`;
await sql`CREATE SCHEMA public`;
await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
console.log('Şema sıfırlandı');
await sql.end();

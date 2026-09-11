import { NextResponse } from 'next/server';
import { sql } from '@plantero/db';

export const dynamic = 'force-dynamic';

/**
 * Sağlık ucu: Postgres ping + şema/seed durumu. Yük dengeleyici / Playwright webServer bunu bekler;
 * dağıtım teşhisinde (Railway vb.) "tablo yok" ile "seed yok" ayrımını tek bakışta verir.
 */
export async function GET() {
  try {
    await sql`select 1`;
    const [t] = await sql<{ n: number }[]>`select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
    const tables = t?.n ?? 0;
    let users = 0;
    if (tables > 0) {
      const [u] = await sql<{ n: number }[]>`select count(*)::int as n from users`.catch(() => [{ n: -1 }]);
      users = u?.n ?? -1;
    }
    const ok = tables > 0 && users > 0;
    return NextResponse.json(
      { ok, db: true, tables, users, seeded: users > 0, at: new Date().toISOString() },
      { status: ok ? 200 : 503 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: false, error: err instanceof Error ? err.message : 'db unreachable' },
      { status: 503 },
    );
  }
}

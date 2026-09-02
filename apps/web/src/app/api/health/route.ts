import { NextResponse } from 'next/server';
import { sql } from '@plantero/db';

export const dynamic = 'force-dynamic';

/** Sağlık ucu: Postgres ping. Yük dengeleyici / Playwright webServer bunu bekler. */
export async function GET() {
  try {
    await sql`select 1`;
    return NextResponse.json({ ok: true, db: true, at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: false, error: err instanceof Error ? err.message : 'db unreachable' },
      { status: 503 },
    );
  }
}

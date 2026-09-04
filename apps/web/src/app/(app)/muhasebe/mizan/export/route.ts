import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getTrialBalance } from '@/modules/accounting/queries';

export const dynamic = 'force-dynamic';

function csvEscape(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET(request: Request) {
  await requirePermission('accounting.view');
  const { searchParams } = new URL(request.url);
  const ledger = searchParams.get('ledger') === 'UFRS' ? 'UFRS' : 'VUK';
  const rows = await getTrialBalance(ledger);

  const header = ['Kod', 'Hesap', 'Borç', 'Alacak', 'Bakiye'];
  const lines = [header.join(';'), ...rows.map((r) => [r.code, r.name, r.debit, r.credit, r.balance].map((v) => csvEscape(String(v))).join(';'))];
  const csv = `﻿${lines.join('\r\n')}`;

  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mizan-${ledger}.csv"` },
  });
}

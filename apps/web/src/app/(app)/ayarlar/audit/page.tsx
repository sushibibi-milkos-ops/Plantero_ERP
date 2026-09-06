import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listAuditLog, listAuditTableOptions, listUsers } from '@/modules/settings/queries';
import { PageHeader } from '@/components/page-header';
import { AuditFiltersBar } from '@/modules/settings/components/audit-filters';
import { AuditTable } from '@/modules/settings/components/audit-table';
import { AuditPager } from '@/modules/settings/components/audit-pager';

export const metadata: Metadata = { title: 'Denetim Kaydı' };
export const dynamic = 'force-dynamic';

type Sp = { table?: string; userId?: string; action?: string; from?: string; to?: string; q?: string; page?: string };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requirePermission('admin.audit');
  const sp = await searchParams;
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;

  const [result, tables, users] = await Promise.all([
    listAuditLog({ table: sp.table, userId: sp.userId, action: sp.action, from: sp.from, to: sp.to, q: sp.q, page }),
    listAuditTableOptions(),
    listUsers(),
  ]);

  return (
    <>
      <PageHeader
        title="Denetim Kaydı"
        description={`${result.total.toLocaleString('tr-TR')} kayıt · salt okunur`}
      />
      <AuditFiltersBar tables={tables} users={users.map((u) => ({ id: u.id, fullName: u.fullName }))} />
      <AuditTable rows={result.rows} />
      <AuditPager page={result.page} pageSize={result.pageSize} total={result.total} searchParams={sp} />
    </>
  );
}

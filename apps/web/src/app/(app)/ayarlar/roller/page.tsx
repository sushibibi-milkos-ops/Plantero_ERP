import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listRoles } from '@/modules/settings/queries';
import { buildPermissionMatrix } from '@/modules/settings/permission-matrix';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { RoleList } from '@/modules/settings/components/role-list';
import { RolePermissionMatrix } from '@/modules/settings/components/role-permission-matrix';
import { NewRoleDialog } from '@/modules/settings/components/new-role-dialog';

export const metadata: Metadata = { title: 'Roller' };
export const dynamic = 'force-dynamic';

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  await requirePermission('admin.users');
  const [roles, sp] = await Promise.all([listRoles(), searchParams]);
  const matrix = buildPermissionMatrix();

  const activeCount = roles.filter((r) => r.isActive).length;
  const selected = roles.find((r) => r.id === sp.role) ?? roles.find((r) => r.code === 'admin') ?? roles[0];

  return (
    <>
      <PageHeader
        title="Roller ve İzinler"
        description={`${roles.length} rol · ${activeCount} aktif`}
        actions={<NewRoleDialog />}
      />

      {!selected ? (
        <EmptyState title="Henüz rol yok" description="Seed çalıştırıldığında rol/izin ön ayarları burada listelenir." />
      ) : (
        <div className="flex flex-col gap-5 md:flex-row md:gap-6">
          <RoleList roles={roles} selectedId={selected.id} />
          <RolePermissionMatrix role={selected} matrix={matrix} />
        </div>
      )}
    </>
  );
}

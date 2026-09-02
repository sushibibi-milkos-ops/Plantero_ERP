import type { Metadata } from 'next';
import { UserPlus } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { listUsers } from '@/modules/settings/queries';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { UsersTable } from '@/modules/settings/components/users-table';

export const metadata: Metadata = { title: 'Kullanıcılar' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  await requirePermission('admin.users');
  const users = await listUsers();
  const active = users.filter((u) => u.isActive).length;

  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        description={`${users.length} kullanıcı · ${active} aktif`}
        actions={
          <Button disabled title="Yakında">
            <UserPlus className="size-4" /> Yeni kullanıcı
          </Button>
        }
      />
      <UsersTable users={users} />
    </>
  );
}

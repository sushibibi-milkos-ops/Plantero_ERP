import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { listPlans } from '@/modules/maintenance/queries';
import { PlansTable } from '@/modules/maintenance/components/plans-table';

export const metadata: Metadata = { title: 'Bakım Planları' };
export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const user = await requirePermission('maintenance.view');
  const plans = await listPlans();
  const due = plans.filter((p) => p.isActive && p.nextDueAt && p.nextDueAt <= new Date().toISOString().slice(0, 10)).length;

  return (
    <>
      <PageHeader
        title="Bakım Planları"
        description={`${plans.length} periyodik plan — ${due} vadesi geldi`}
        actions={
          userCan(user, 'maintenance.plan') ? (
            <Button asChild>
              <Link href="/bakim/planlar/yeni"><Plus className="size-4" /> Yeni plan</Link>
            </Button>
          ) : undefined
        }
      />
      <PlansTable plans={plans} />
    </>
  );
}

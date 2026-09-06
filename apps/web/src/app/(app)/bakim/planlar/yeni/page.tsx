import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listActiveMachinesForForm, listMaintenanceAssignees } from '@/modules/maintenance/queries';
import { PlanForm } from '@/modules/maintenance/components/plan-form';

export const metadata: Metadata = { title: 'Yeni Bakım Planı' };
export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  await requirePermission('maintenance.plan');
  const [machines, assignees] = await Promise.all([listActiveMachinesForForm(), listMaintenanceAssignees()]);

  return (
    <>
      <PageHeader title="Yeni Bakım Planı" description="Periyodik bakım — vadesi geldiğinde iş emri otomatik açılır" />
      <PlanForm machines={machines} assignees={assignees} />
    </>
  );
}

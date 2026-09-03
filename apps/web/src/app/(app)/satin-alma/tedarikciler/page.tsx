import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listSupplierCards } from '@/modules/purchasing/queries';
import { SuppliersTable } from '@/modules/purchasing/components/suppliers-table';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Tedarikçiler' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const user = await requirePermission('purchasing.view');
  const suppliers = await listSupplierCards();
  const whitelisted = suppliers.filter((s) => s.isPurchaseWhitelisted).length;

  return (
    <>
      <PageHeader title="Tedarikçiler" description={`${suppliers.length} tedarikçi · ${whitelisted} beyaz listede`} />
      <SuppliersTable suppliers={suppliers} canManageWhitelist={userCan(user, 'purchasing.approve')} />
    </>
  );
}

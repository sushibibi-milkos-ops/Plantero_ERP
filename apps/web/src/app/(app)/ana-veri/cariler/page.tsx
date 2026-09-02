import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listPartners } from '@/modules/masterdata/queries';
import { PartnersTable } from '@/modules/masterdata/components/partners-table';
import { PartnerCreateDialog } from '@/modules/masterdata/components/partner-create-dialog';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Cariler' };
export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
  const user = await requirePermission('masterdata.view');
  const partners = await listPartners();
  const canManage = userCan(user, 'masterdata.manage');
  const customers = partners.filter((p) => p.kind === 'customer' || p.kind === 'both').length;
  const suppliers = partners.filter((p) => p.kind === 'supplier' || p.kind === 'both').length;

  return (
    <>
      <PageHeader
        title="Cariler"
        description={`${partners.length} cari · ${customers} müşteri · ${suppliers} tedarikçi`}
        actions={canManage ? <PartnerCreateDialog /> : undefined}
      />
      <PartnersTable partners={partners} />
    </>
  );
}

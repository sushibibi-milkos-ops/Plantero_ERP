import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listBoms, listManufacturedProducts, listBomComponentCandidates } from '@/modules/masterdata/queries';
import { BomsTable } from '@/modules/masterdata/components/boms-table';
import { BomCreateDialog } from '@/modules/masterdata/components/bom-create-dialog';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Reçeteler' };
export const dynamic = 'force-dynamic';

export default async function BomsPage() {
  const user = await requirePermission('masterdata.view');
  const canManage = userCan(user, 'masterdata.manage');
  const [boms, manufactured, candidates] = await Promise.all([listBoms(), listManufacturedProducts(), listBomComponentCandidates()]);

  const active = boms.filter((b) => b.status === 'active').length;
  const productOptions = manufactured.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}`, keywords: [p.sku] }));

  return (
    <>
      <PageHeader
        title="Reçeteler"
        description={`${boms.length} reçete versiyonu · ${active} aktif`}
        actions={canManage ? <BomCreateDialog productOptions={productOptions} candidates={candidates as never} /> : undefined}
      />
      <BomsTable boms={boms} />
    </>
  );
}

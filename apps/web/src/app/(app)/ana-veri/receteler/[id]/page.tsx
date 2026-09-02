import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { getBomById, listBomLines, listBomVersions, getBomCostRollup, listBomComponentCandidates } from '@/modules/masterdata/queries';
import { BomDetailForm } from '@/modules/masterdata/components/bom-detail-form';
import { BomVersionHistory } from '@/modules/masterdata/components/bom-version-history';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const bom = await getBomById(id);
  return { title: bom ? `${bom.b.code}` : 'Reçete' };
}

export const dynamic = 'force-dynamic';

export default async function BomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('masterdata.view');
  const canManage = userCan(user, 'masterdata.manage');

  const bom = await getBomById(id);
  if (!bom) notFound();

  const [lines, versions, candidates] = await Promise.all([listBomLines(id), listBomVersions(bom.b.productId), listBomComponentCandidates()]);

  const rollup = await getBomCostRollup(id).catch(() => ({ materialCost: '0', overheadCost: '0', unitCost: '0' }));
  const versionRollups = await Promise.all(
    versions.map(async (v) => {
      try {
        const r = await getBomCostRollup(v.id);
        return { id: v.id, code: v.code, version: v.version, status: v.status, unitCost: r.unitCost };
      } catch {
        return { id: v.id, code: v.code, version: v.version, status: v.status, unitCost: '0' };
      }
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow={`${bom.sku} — ${bom.productName}`}
        title={bom.b.name || bom.b.code}
        description={`Versiyon ${bom.b.version}`}
      />
      <div className="space-y-8">
        <BomDetailForm
          bom={{ id: bom.b.id, code: bom.b.code, status: bom.b.status, productId: bom.b.productId, sku: bom.sku, name: bom.b.name, outputQty: bom.b.outputQty, outputUomCode: bom.outputUomCode, expectedYieldPct: bom.b.expectedYieldPct, cycleMinutes: bom.b.cycleMinutes, overheadPerBatch: bom.b.overheadPerBatch, overheadPerUnit: bom.b.overheadPerUnit, note: bom.b.note }}
          lines={lines as never}
          rollup={rollup}
          candidates={candidates as never}
          canManage={canManage}
        />
        <BomVersionHistory versions={versionRollups} currentId={id} />
      </div>
    </>
  );
}

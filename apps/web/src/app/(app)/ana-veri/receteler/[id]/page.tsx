import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { getBomById, listBomLines, listBomVersions, getBomCostRollup, listBomComponentCandidates, listAuditFor } from '@/modules/masterdata/queries';
import { DetailTabs, type ProductTabDef } from '@/modules/masterdata/components/product-detail-tabs';
import { BomDetailForm } from '@/modules/masterdata/components/bom-detail-form';
import { BomHeaderActions } from '@/modules/masterdata/components/bom-header-actions';
import { BomVersionHistory } from '@/modules/masterdata/components/bom-version-history';
import { AuditTab } from '@/modules/masterdata/components/audit-tab';
import { BOM_STATUS_LABELS } from '@/modules/masterdata/product-labels';

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

  const [lines, versions, candidates, audit] = await Promise.all([
    listBomLines(id),
    listBomVersions(bom.b.productId),
    listBomComponentCandidates(),
    listAuditFor('boms', id),
  ]);

  const rollup = await getBomCostRollup(id).catch(() => ({ materialCost: '0', overheadCost: '0', unitCost: '0', lines: [], bomId: id, effectiveOutputQty: '0' }));
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

  const tabs: ProductTabDef[] = [
    { value: 'bilesenler', label: 'Bileşenler', content: <BomDetailForm bom={{ id: bom.b.id, code: bom.b.code, status: bom.b.status, productId: bom.b.productId, sku: bom.sku, name: bom.b.name, outputQty: bom.b.outputQty, outputUomCode: bom.outputUomCode, expectedYieldPct: bom.b.expectedYieldPct, cycleMinutes: bom.b.cycleMinutes, overheadPerBatch: bom.b.overheadPerBatch, overheadPerUnit: bom.b.overheadPerUnit, note: bom.b.note }} lines={lines as never} rollup={rollup} candidates={candidates as never} canManage={canManage} /> },
    {
      value: 'versiyonlar',
      label: 'Versiyonlar',
      content:
        versionRollups.length > 1 ? (
          <BomVersionHistory versions={versionRollups} currentId={id} />
        ) : (
          <EmptyState compact title="Tek versiyon" description="Bu reçetenin başka bir versiyonu yok — 'Yeni versiyon' ile bir kopya oluşturabilirsiniz." />
        ),
    },
    { value: 'denetim', label: 'Denetim', content: <AuditTab rows={audit as never} /> },
  ];

  return (
    <>
      <PageHeader
        // Tur 4 P2: eyebrow salt metindi — ürüne gitmenin tek yolu geri gidip ürün listesinden aramaktı.
        eyebrow={
          <Link href={`/ana-veri/urunler/${bom.b.productId}`} className="hover:text-foreground hover:underline">
            {bom.sku} — {bom.productName}
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-2">
            {bom.b.name || bom.b.code}
            <StatusBadge status={bom.b.status} label={BOM_STATUS_LABELS[bom.b.status] ?? bom.b.status} kind="bom" />
          </span>
        }
        description={<span className="font-mono text-[12px]">{bom.b.code} · Versiyon {bom.b.version}</span>}
        actions={
          canManage ? (
            <BomHeaderActions
              bom={{
                id: bom.b.id,
                productId: bom.b.productId,
                status: bom.b.status,
                name: bom.b.name,
                outputQty: bom.b.outputQty,
                expectedYieldPct: bom.b.expectedYieldPct,
                overheadPerBatch: bom.b.overheadPerBatch,
                overheadPerUnit: bom.b.overheadPerUnit,
                note: bom.b.note,
              }}
              lines={lines.map((l) => ({ productId: l.line.productId, qty: l.line.qty, uomId: l.line.uomId, scrapPct: l.line.scrapPct, isByproduct: l.line.isByproduct }))}
            />
          ) : null
        }
      />
      <DetailTabs tabs={tabs} defaultTab="bilesenler" />
    </>
  );
}

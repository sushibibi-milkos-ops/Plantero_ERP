import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listHsCodes, listGtipProducts } from '@/modules/export/queries';
import { GtipMappingTable } from '@/modules/export/components/gtip-mapping-table';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = { title: 'GTİP Eşlemesi' };
export const dynamic = 'force-dynamic';

export default async function ExportGtipPage() {
  const user = await requirePermission('export.view');
  const [hsCodeOptions, products] = await Promise.all([listHsCodes(), listGtipProducts()]);
  const mapped = products.filter((p) => p.hsCode).length;
  const unmapped = products.length - mapped;

  return (
    <>
      <PageHeader
        title="GTİP Eşlemesi"
        description="Gümrük tarife istatistik pozisyonu (GTİP) kodları ve satılabilir ürün eşlemesi. Çeki listesi ve gümrük beyannamesi bu eşlemeyi kullanır."
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="GTİP kodu" value={hsCodeOptions.length} format="int" />
        <KpiCard variant="strip" title="Satılabilir ürün" value={products.length} format="int" />
        <KpiCard variant="strip" title="Eşlenmiş" value={mapped} format="int" />
        <KpiCard variant="strip" title="Eşlenmemiş" value={unmapped} format="int" hint={unmapped > 0 ? 'GTİP atanmalı' : 'Tamamlandı'} />
      </KpiStripRow>

      <div className="mb-6 overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">GTİP</th>
              <th className="px-3 py-2 font-medium">Açıklama</th>
              <th className="px-3 py-2 font-medium">Birim</th>
            </tr>
          </thead>
          <tbody>
            {hsCodeOptions.map((h) => (
              <tr key={h.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="px-3 py-2.5 font-mono font-medium">{h.code}</td>
                <td className="px-3 py-2.5">{h.description}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{h.unit ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {hsCodeOptions.length === 0 ? <EmptyState compact title="GTİP kodu tanımlı değil" /> : null}
      </div>

      <GtipMappingTable products={products} hsCodeOptions={hsCodeOptions} editable={userCan(user, 'export.manage')} />
    </>
  );
}

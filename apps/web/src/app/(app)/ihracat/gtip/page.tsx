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

      {/* Tur 1 P1 kök neden düzeltmesi: başlık önceden UPPERCASE (ihracat-gtip-03) idi — alttaki
          ürün eşleme tablosu (`DataTable`) cümle düzeni 12px muted kullanıyor, sekmesiz tek ekranda
          fark doğrudan görülüyordu. `text-[12px] font-medium text-muted-foreground` artık `DataTable`
          th'siyle birebir aynı. Sütun genişlikleri (ihracat-gtip-04, `DataTable`'daki gibi INLINE
          `style` — `table-layout:fixed` + Tailwind `w-*` denendi ama üç sütun da genişlik alınca
          tarayıcı oranlı ölçekleyip w-full'e geri yayıyordu): 'Açıklama' önceden genişliğin %74'ünü
          (847px) kaplıyordu, artık ≤480px (~%42) — 'Birim' sütunu sağ kenarda yalnız kalmaz. */}
      <div className="mb-6 overflow-x-auto rounded-lg border border-border/60">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[12px] font-medium text-muted-foreground">
              <th className="px-3 py-2" style={{ width: 140, minWidth: 140 }}>GTİP</th>
              <th className="px-3 py-2" style={{ width: 480, maxWidth: 480 }}>Açıklama</th>
              <th className="px-3 py-2" style={{ width: 110, minWidth: 110 }}>Birim</th>
            </tr>
          </thead>
          <tbody>
            {hsCodeOptions.map((h) => (
              <tr key={h.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="px-3 py-2.5 font-mono font-medium">{h.code}</td>
                <td className="px-3 py-2.5" style={{ maxWidth: 480 }} title={h.description}>{h.description}</td>
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

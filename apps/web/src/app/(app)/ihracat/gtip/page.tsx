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

      {/* Tur 1 P1 kök neden düzeltmesi (ihracat-gtip-03, -04): bu 4 satırlık referans listesi bir
          <table> DEĞİL, tek satırlık bir etiket/kart şeridi — hem UPPERCASE başlık uyuşmazlığını
          (alttaki `GtipMappingTable` `DataTable` kullanıyor, burada th hiç yok) hem de 'Açıklama'
          sütununun genişliğin %74'ünü (847px) yutup 'Birim'i sağ kenarda yalnız bırakmasını kökten
          ortadan kaldırır — `max-width`/`table-layout:fixed` denemeleri (bkz. git geçmişi) tarayıcının
          kalan boşluğu yine orantılı geri dağıtması yüzünden ölçülebilir bir iyileşme vermedi; bu 4
          statik referans kod için tablo anatomisi zaten gereksizdi (kriter 12 — sessiz satır, çerçeve
          çorbası değil). Her kart kendi içinde satır kırar; genişlik içeriğe göre doğal akar. */}
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {hsCodeOptions.map((h) => (
          <div key={h.id} className="rounded-lg border border-border/60 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[13px] font-medium">{h.code}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{h.unit ?? '—'}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{h.description}</p>
          </div>
        ))}
        {hsCodeOptions.length === 0 ? <EmptyState compact title="GTİP kodu tanımlı değil" className="sm:col-span-2 lg:col-span-4" /> : null}
      </div>

      <GtipMappingTable products={products} hsCodeOptions={hsCodeOptions} editable={userCan(user, 'export.manage')} />
    </>
  );
}

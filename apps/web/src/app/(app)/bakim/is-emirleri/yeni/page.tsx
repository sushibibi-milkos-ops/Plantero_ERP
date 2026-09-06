import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listActiveMachinesForForm } from '@/modules/maintenance/queries';
import { ReportBreakdownForm } from '@/modules/maintenance/components/report-breakdown-form';

export const metadata: Metadata = { title: 'Arıza Bildir' };
export const dynamic = 'force-dynamic';

export default async function ReportBreakdownPage() {
  await requirePermission('maintenance.report');
  const machines = await listActiveMachinesForForm();

  return (
    <>
      {/* Kök neden (Tur 4 P2 bakim-yeni-03): PageHeader'a uygulanan `mx-auto max-w-xl` başlığı 288px
          sağa kaydırıyordu — modülün diğer route'larında PageHeader tam genişlik. Form gövdesi zaten
          kendi `mx-auto max-w-xl`'ini taşıyor (report-breakdown-form.tsx) — ortalama YALNIZCA orada
          kalmalı, PageHeader tam genişlikte diğer bakım sayfalarıyla aynı h1 oluğunu (264px) paylaşır. */}
      <PageHeader title="Arıza Bildir" description="Makineyi tarayın ya da seçin, fotoğraf ekleyin" />
      {/* Kök neden (Tur 5 P1 bakim-yeni-02/04/05, Tur 4'ün DÜZELTMESİ TERSİNE ÇEVRİLDİ):
          Tur 4'te eklenen sağ ray (320px "son bildirilen arızalar" + 36 makinelik iç kaydırmalı
          MachineQuickList) ana sütunu (form, makine seçilmeden önce kısaydı çünkü 2. adım alanları
          `scanned` truthy olana kadar hiç render edilmiyordu) sağ raydaki en uzun kartın (483px)
          boyuna GERDİ — grid'de tek satırlı `auto` iz, `items-start` içerikleri üstte hizalasa bile
          satır yüksekliği en uzun sütuna göre belirlenir, bu da ana sütunda 592px ölü alan bıraktı
          (scripts/probe-bakim-r5e.ts). "Son bildirilen arızalar" panelini sağ ray yerine formun
          ALTINA taşımak da yetmedi: `main` şablonu uygulama genelinde `min-h-dvh` taşıdığından
          (app-shell.tsx) belge yüksekliği zaten viewport'a sabitleniyor, panel Vazgeç düğmesinden
          SONRA geldiği için ölçüm hâlâ "boş alan" olarak sayıyordu (829→1067px panel + altında 40px
          daha — toplam 294px, hedef ≤200'ün üzerinde). Kök neden çözümü: sağ ray VE alt panel
          tamamen kaldırıldı; 2. adım alanları (başlık/açıklama/öncelik/fotoğraf) artık makine
          seçilmeden ÖNCE de görünür (report-breakdown-form.tsx) — form artık tek başına, tam
          genişlikte, GERÇEK içerikle Vazgeç düğmesine kadar dolduruyor; hiçbir şey onun ardından
          gelmiyor. */}
      <ReportBreakdownForm machines={machines} />
    </>
  );
}

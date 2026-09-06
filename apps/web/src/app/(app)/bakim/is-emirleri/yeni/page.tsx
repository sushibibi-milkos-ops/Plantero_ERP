import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listActiveMachinesForForm, listRecentBreakdowns } from '@/modules/maintenance/queries';
import { ReportBreakdownForm } from '@/modules/maintenance/components/report-breakdown-form';
import { RecentBreakdownsPanel } from '@/modules/maintenance/components/recent-breakdowns-panel';

export const metadata: Metadata = { title: 'Arıza Bildir' };
export const dynamic = 'force-dynamic';

export default async function ReportBreakdownPage() {
  await requirePermission('maintenance.report');
  const [machines, recentBreakdowns] = await Promise.all([listActiveMachinesForForm(), listRecentBreakdowns(3)]);

  return (
    <>
      {/* Kök neden (Tur 4 P2 bakim-yeni-03): PageHeader'a uygulanan `mx-auto max-w-xl` başlığı 288px
          sağa kaydırıyordu — modülün diğer route'larında PageHeader tam genişlik. Form gövdesi zaten
          kendi `mx-auto max-w-xl`'ini taşıyor (report-breakdown-form.tsx) — ortalama YALNIZCA orada
          kalmalı, PageHeader tam genişlikte diğer bakım sayfalarıyla aynı h1 oluğunu (264px) paylaşır. */}
      <PageHeader title="Arıza Bildir" description="Makineyi tarayın ya da seçin, fotoğraf ekleyin" />
      {/* Kök neden (Tur 5 P1 bakim-yeni-02/05, Tur 4'ün DÜZELTMESİ TERSİNE ÇEVRİLDİ): Tur 4'te
          eklenen sağ ray (320px "son bildirilen arızalar" + 36 makinelik iç kaydırmalı liste)
          ana sütunu (form, makine seçilmeden önce kısa) sağ raydaki en uzun kartın (483px) boyuna
          GERDİ — grid'de tek satırlı `auto` iz, `items-start` içerikleri üstte hizalasa bile satır
          yüksekliği en uzun sütuna göre belirlenir, bu da ana sütunda 592px ölü alan bıraktı
          (scripts/probe-bakim-r5e.ts). Ayrıca 36 makinelik iç kaydırıcılı `MachineQuickList` formun
          kendi "Makine ara ve seç…" combobox'ıyla aynı işi yapan kutu-içinde-kaydırma dolgusuydu.
          Düzeltme: `MachineQuickList` kaldırıldı; sağ ray tamamen kaldırılıp sayfa TEK SÜTUNA
          döndürüldü — masaüstünde form ana sütunun tam genişliğine yayılır (artık rakip bir sütun
          olmadığından grid stretch'i de ortadan kalkar). "Son bildirilen arızalar" 3 satıra
          düşürülüp formun ALTINA, aynı tek sütunda eklendi — sayfa artık gerçek içerikle biter,
          Vazgeç düğmesinden sonra boş alan kalmaz. */}
      <div className="mx-auto max-w-xl space-y-4 lg:mx-0">
        <ReportBreakdownForm machines={machines} />
        <RecentBreakdownsPanel items={recentBreakdowns} />
      </div>
    </>
  );
}

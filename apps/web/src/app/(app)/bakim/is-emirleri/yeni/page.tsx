import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listActiveMachinesForForm, listRecentBreakdowns } from '@/modules/maintenance/queries';
import { ReportBreakdownForm } from '@/modules/maintenance/components/report-breakdown-form';
import { RecentBreakdownsPanel } from '@/modules/maintenance/components/recent-breakdowns-panel';
import { MachineQuickList } from '@/modules/maintenance/components/machine-quick-list';

export const metadata: Metadata = { title: 'Arıza Bildir' };
export const dynamic = 'force-dynamic';

export default async function ReportBreakdownPage() {
  await requirePermission('maintenance.report');
  const [machines, recentBreakdowns] = await Promise.all([listActiveMachinesForForm(), listRecentBreakdowns()]);

  return (
    <>
      {/* Kök neden (Tur 4 P2 bakim-yeni-03): PageHeader'a uygulanan `mx-auto max-w-xl` başlığı 288px
          sağa kaydırıyordu — modülün diğer route'larında PageHeader tam genişlik. Form gövdesi zaten
          kendi `mx-auto max-w-xl`'ini taşıyor (report-breakdown-form.tsx) — ortalama YALNIZCA orada
          kalmalı, PageHeader tam genişlikte diğer bakım sayfalarıyla aynı h1 oluğunu (264px) paylaşır. */}
      <PageHeader title="Arıza Bildir" description="Makineyi tarayın ya da seçin, fotoğraf ekleyin" />
      {/* Kök neden (Tur 4 P2 bakim-yeni-02): tek sütunlu telefon akışı 1440px'te ekranın %85'ini
          boş bırakıyordu (emptyBelow 563px). Sahadaki akış DEĞİŞMEDİ (form hâlâ kendi içinde
          `mx-auto max-w-xl`, telefonda tek sütun) — yalnızca `lg:` üzerinde yanına "son bildirilen
          arızalar" paneli eklendi, geniş masaüstü ekranını dolduruyor. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <ReportBreakdownForm machines={machines} />
        <div className="hidden space-y-4 lg:block">
          <RecentBreakdownsPanel items={recentBreakdowns} />
          <MachineQuickList machines={machines} />
        </div>
      </div>
    </>
  );
}

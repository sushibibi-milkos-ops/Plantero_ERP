import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listProjects, listManufacturableProductOptions } from '@/modules/rnd/queries';
import { ProjectList } from '@/modules/rnd/components/project-list';
import { NewProjectDialog } from '@/modules/rnd/components/new-project-dialog';

export const metadata: Metadata = { title: 'Ar-Ge Projeleri' };
export const dynamic = 'force-dynamic';

export default async function RndProjectsPage() {
  const user = await requirePermission('rnd.view');
  const [projects, productOptions] = await Promise.all([listProjects(), listManufacturableProductOptions()]);
  const canManage = userCan(user, 'rnd.manage');

  return (
    <>
      {/* "${projects.length} proje" ÖNEKİ KALDIRILDI (kök neden düzeltmesi, Tur 5 P2 arge-projeler-08):
          DataTable'ın kendi araç çubuğu (varsayılan liste görünümünde) "N kayıt" sayacını zaten
          kendiliğinden gösteriyor (toolbar.tsx) — aynı sayı iki yerde tekrarlanmasın. line-clamp-1:
          390px'te açıklama sarmadan tek satırda kalır (kart görünümünde de sayı görünür kalıyor —
          kartların kendisi sayılabilir). PageHeader (ortak bileşen) DEĞİŞMEDİ. Tam hedef (≤112px)
          DataTable araç çubuğunun PageHeader ile AYNI satırda birleşmesini gerektirir — ortak (shell)
          bir PageHeader/DataTable kompozisyon değişikliği ister; bkz. rapor. */}
      <PageHeader
        title="Ar-Ge Projeleri"
        description={<span className="line-clamp-1">Trello mantığı kanban board, versiyonlu deneme reçetesi ve canlı maliyet simülasyonu</span>}
        actions={canManage ? <NewProjectDialog productOptions={productOptions} /> : undefined}
      />
      <ProjectList projects={projects} canManage={canManage} productOptions={productOptions} />
    </>
  );
}

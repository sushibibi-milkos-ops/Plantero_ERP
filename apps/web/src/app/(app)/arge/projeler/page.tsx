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
      <PageHeader
        title="Ar-Ge Projeleri"
        description={`${projects.length} proje — Trello mantığı kanban board, versiyonlu deneme reçetesi ve canlı maliyet simülasyonu`}
        actions={canManage ? <NewProjectDialog productOptions={productOptions} /> : undefined}
      />
      <ProjectList projects={projects} canManage={canManage} productOptions={productOptions} />
    </>
  );
}

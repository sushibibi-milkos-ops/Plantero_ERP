import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getProject, listRecipesForProject, listVersionsForRecipe, listProductOptions, listUomOptions } from '@/modules/rnd/queries';
import { RecipeWorkspace } from '@/modules/rnd/components/recipe-workspace';
import { ProjectNavTabs } from '@/modules/rnd/components/project-nav-tabs';
import { PROJECT_STATUS_LABELS } from '@/modules/rnd/labels';

export const metadata: Metadata = { title: 'Deneme Reçeteleri' };
export const dynamic = 'force-dynamic';

export default async function RndRecipesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('rnd.view');
  const project = await getProject(id);
  if (!project) notFound();

  const [recipes, productOptions, uomOptions] = await Promise.all([listRecipesForProject(id), listProductOptions(), listUomOptions()]);
  const versionLists = await Promise.all(recipes.map((r) => listVersionsForRecipe(r.id)));
  const recipesWithVersions = recipes.map((recipe, i) => ({ recipe, versions: versionLists[i] ?? [] }));

  const status = PROJECT_STATUS_LABELS[project.status] ?? { label: project.status, tone: 'muted' as const };

  return (
    <>
      <PageHeader
        eyebrow={project.code}
        title={project.name}
        description={project.goal ?? undefined}
        actions={<StatusBadge status={project.status} label={status.label} tone={status.tone} />}
      >
        <ProjectNavTabs projectId={id} />
      </PageHeader>
      <RecipeWorkspace
        projectId={id}
        recipesWithVersions={recipesWithVersions}
        productOptions={productOptions}
        uomOptions={uomOptions}
        canManage={userCan(user, 'rnd.manage')}
        canRelease={userCan(user, 'rnd.release')}
      />
    </>
  );
}

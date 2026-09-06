import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getProject, getBoard, listUserOptions, listVersionsForRecipe, listRecipesForProject } from '@/modules/rnd/queries';
import { KanbanBoard } from '@/modules/rnd/components/kanban-board';
import { ProjectNavTabs } from '@/modules/rnd/components/project-nav-tabs';
import { PROJECT_STATUS_LABELS } from '@/modules/rnd/labels';

export const metadata: Metadata = { title: 'Ar-Ge Board' };
export const dynamic = 'force-dynamic';

export default async function RndBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('rnd.view');
  const project = await getProject(id);
  if (!project) notFound();

  const [{ columns, cards }, userOptions, recipes] = await Promise.all([getBoard(id), listUserOptions(), listRecipesForProject(id)]);
  const versionLists = await Promise.all(recipes.map((r) => listVersionsForRecipe(r.id)));
  const recipeVersionOptions = recipes.flatMap((r, i) => (versionLists[i] ?? []).map((v) => ({ id: v.id, label: `${r.name} v${v.version}` })));

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
      <KanbanBoard projectId={id} columns={columns} cards={cards} userOptions={userOptions} recipeVersionOptions={recipeVersionOptions} />
    </>
  );
}

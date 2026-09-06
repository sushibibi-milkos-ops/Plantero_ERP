import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getProject, listRecipesForProject, listVersionsForRecipe, listProductOptions, listUomOptions, getVersionDetail } from '@/modules/rnd/queries';
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

  // İlk seçili versiyonun BİRİNCİL panel verisi (maliyet simülasyonu) burada, sunucuda getirilir —
  // RecipeWorkspace hidrasyondan sonra client'ta çıplak bir spinner'la beklemesin (kök neden düzeltmesi,
  // Tur 3 P1 criterion-7: ilk açılışta busy fazı 1,70sn sürüyor, panel 194px→982px sıçrıyordu). Client
  // fetch yalnızca kullanıcı BAŞKA bir versiyon seçtiğinde çalışır.
  const initialGroup = recipesWithVersions[0] ?? null;
  const initialVersionId = initialGroup?.recipe.currentVersionId ?? initialGroup?.versions[0]?.id ?? null;
  const initialDetail = initialVersionId ? await getVersionDetail(initialVersionId) : null;

  const status = PROJECT_STATUS_LABELS[project.status] ?? { label: project.status, tone: 'muted' as const };

  return (
    <>
      <PageHeader
        eyebrow={project.code}
        title={project.name}
        // 1 satıra clamp: kök neden düzeltmesi (Tur 4 P1 arge-recete-18) — proje hedefi (goal) 3
        // satıra kadar sarabiliyordu, 390px'te "Hedef maliyete göre" panelinin üst kenarını aşağı
        // itiyordu. PageHeader (ortak bileşen) değiştirilmedi — clamp yalnızca burada, ReactNode
        // olarak geçirilen açıklamada uygulanıyor.
        description={project.goal ? <span className="line-clamp-1">{project.goal}</span> : undefined}
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
        initialDetail={initialDetail}
      />
    </>
  );
}

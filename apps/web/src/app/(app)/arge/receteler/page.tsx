import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listAllRecipes } from '@/modules/rnd/queries';
import { AllRecipesTable } from '@/modules/rnd/components/all-recipes-table';

export const metadata: Metadata = { title: 'Deneme Reçeteleri' };
export const dynamic = 'force-dynamic';

export default async function AllRecipesPage() {
  await requirePermission('rnd.view');
  const recipes = await listAllRecipes();

  return (
    <>
      <PageHeader title="Deneme Reçeteleri" description={`${recipes.length} deneme reçetesi — tüm Ar-Ge projeleri`} />
      <AllRecipesTable recipes={recipes} />
    </>
  );
}

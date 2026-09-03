import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listLineCards } from '@/modules/production/queries';
import { LineCards } from '@/modules/production/components/line-cards';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Üretim Hatları' };
export const dynamic = 'force-dynamic';

export default async function ProductionLinesPage() {
  await requirePermission('production.view');
  const lines = await listLineCards();

  return (
    <>
      <PageHeader title="Üretim Hatları" description="Hat 1 · Bazlar, Barista & Kremalar — Hat 2 · Toz Karıştırma & Dolum — Hat 3 · Saşe / Stick Toz Dolum" />
      <LineCards lines={lines} />
    </>
  );
}

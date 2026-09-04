import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { getForecastPage } from '@/modules/finance/forecast-queries';
import { ForecastPanels } from '@/modules/finance/components/forecast-panel';

export const metadata: Metadata = { title: 'Tahmin' };
export const dynamic = 'force-dynamic';

export default async function ForecastPage() {
  await requirePermission('finance.view');
  const data = await getForecastPage();

  return (
    <>
      <PageHeader title="AI Satış / Nakit Tahmini" description="Son 12 ay + gelecek 6 ay tahmin (AI, yoksa mevsimsel hareketli ortalama fallback)" />
      <ForecastPanels data={data} />
    </>
  );
}

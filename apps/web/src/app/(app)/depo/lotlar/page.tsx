import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listLots } from '@/modules/stock/queries';
import { LotsTable } from '@/modules/stock/components/lots-table';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Lotlar' };
export const dynamic = 'force-dynamic';

export default async function LotsPage() {
  await requirePermission('stock.view');
  const lots = await listLots();

  return (
    <>
      {/* Durum kırılımı ("195 serbest · 3 karantinada · 2 red") artık burada statik metin değil —
          LotsTable'ın kendi tıklanabilir durum çipi şeridinde (Tur 4 P1 bulgusu suggestedFix). */}
      <PageHeader title="Lotlar" description={`${lots.length} lot`} />
      <LotsTable lots={lots} />
    </>
  );
}

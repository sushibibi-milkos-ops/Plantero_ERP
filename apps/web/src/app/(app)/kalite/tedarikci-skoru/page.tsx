import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { Star, Users, TrendingDown } from 'lucide-react';
import { listSupplierScores, boardFromScores } from '@/modules/quality/queries';
import { SupplierScoreTable } from '@/modules/quality/components/supplier-score-table';
import { ComputeScoreButton } from '@/modules/quality/components/compute-score-button';

export const metadata: Metadata = { title: 'Tedarikçi Kalite Skoru' };
export const dynamic = 'force-dynamic';

export default async function SupplierScorePage() {
  await requirePermission('quality.view');
  const scores = await listSupplierScores();
  const board = boardFromScores(scores);
  const avg = board.length ? board.reduce((a, b) => a + b.score, 0) / board.length : null;
  const lowest = board.length ? board[0] : null;

  return (
    <>
      <PageHeader
        title="Tedarikçi Kalite Skoru"
        description="Kalite %50 · zamanında teslimat %30 · miktar doğruluğu %20"
        actions={<ComputeScoreButton />}
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard title="Ortalama skor" value={avg} format="int" icon={<Star />} />
        <KpiCard title="Değerlendirilen tedarikçi" value={board.length} format="int" icon={<Users />} />
        <KpiCard title="En düşük skor" value={lowest?.score ?? null} format="int" icon={<TrendingDown />} hint={lowest?.partnerName} />
      </div>
      <SupplierScoreTable rows={board} />
    </>
  );
}

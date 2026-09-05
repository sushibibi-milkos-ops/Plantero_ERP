import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
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
      {/* Tur 1 P1 kalite-kpi-strip-01/kalite-tedarikci-02: `variant="card"` (136px, süs ikonlu) yerine
          diğer 12 modülün tamamının kullandığı Stripe tarzı şerit (80px, ikonsuz) — bkz. kpi-strip.tsx. */}
      <KpiStripRow>
        <KpiCard title="Ortalama skor" value={avg} format="int" variant="strip" />
        <KpiCard title="Değerlendirilen tedarikçi" value={board.length} format="int" variant="strip" />
        <KpiCard title="En düşük skor" value={lowest?.score ?? null} format="int" hint={lowest?.partnerName} variant="strip" />
      </KpiStripRow>
      <SupplierScoreTable rows={board} />
    </>
  );
}

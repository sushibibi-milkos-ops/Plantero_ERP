import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { db, schema } from '@plantero/db';
import { eq } from 'drizzle-orm';
import { getWorkOrderDetail } from '@/modules/production/queries';
import { OperatorWorkOrder } from '@/modules/production/components/operator-work-order';

export const metadata: Metadata = { title: 'Operatör · İş Emri' };
export const dynamic = 'force-dynamic';

const OPEN_STATUSES = ['released', 'in_progress', 'paused'];

/**
 * Operatörün /operator/[lineId] kuyruğundan açıkça seçtiği iş emri (Tur 3 bulgusu, P0 —
 * `getActiveWorkOrderForLine` birden fazla eşit öncelikli açık iş emri varken artık otomatik
 * seçim yapmıyor). Hatta ait değilse veya açık durumda değilse (bitmiş/kapatılmış/iptal) kuyruğa
 * geri yönlendirilir — operatör başka bir sekmede/ekranda o iş emrini zaten ilerletmiş olabilir.
 */
export default async function OperatorWorkOrderByIdPage({ params }: { params: Promise<{ lineId: string; woId: string }> }) {
  const { lineId, woId } = await params;
  await requirePermission('production.operate');

  const [line] = await db.select().from(schema.productionLines).where(eq(schema.productionLines.id, lineId)).limit(1);
  if (!line) notFound();

  const detail = await getWorkOrderDetail(woId);
  if (!detail || detail.wo.lineId !== lineId) notFound();
  if (!OPEN_STATUSES.includes(detail.wo.status)) redirect(`/operator/${lineId}`);

  return <OperatorWorkOrder detail={detail} lineCode={line.code} backHref={`/operator/${lineId}`} />;
}

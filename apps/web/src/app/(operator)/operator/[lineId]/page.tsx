import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageX } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { db, schema } from '@plantero/db';
import { eq } from 'drizzle-orm';
import { getActiveWorkOrderForLine } from '@/modules/production/queries';
import { OperatorWorkOrder } from '@/modules/production/components/operator-work-order';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = { title: 'Operatör · Hat' };
export const dynamic = 'force-dynamic';

export default async function OperatorLinePage({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  await requirePermission('production.operate');

  const [line] = await db.select().from(schema.productionLines).where(eq(schema.productionLines.id, lineId)).limit(1);
  if (!line) notFound();

  const detail = await getActiveWorkOrderForLine(lineId);

  if (!detail) {
    return (
      <div className="mx-auto max-w-md">
        <Link href="/operator" className="mb-4 inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Hat seçimine dön
        </Link>
        <EmptyState
          icon={PackageX}
          title={`${line.name} için aktif iş emri yok`}
          description="Üretim şefi bir iş emrini serbest bıraktığında burada görünecek."
        />
      </div>
    );
  }

  return <OperatorWorkOrder detail={detail} lineCode={line.code} />;
}

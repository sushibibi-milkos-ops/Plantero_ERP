import type { Metadata } from 'next';
import Link from 'next/link';
import { Factory, ChevronRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listProductionLines, getActiveWorkOrderForLine } from '@/modules/production/queries';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { QtyCell } from '@/components/qty-cell';
import { Progress } from '@/components/ui/progress';
import { D } from '@plantero/core';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Operatör' };
export const dynamic = 'force-dynamic';

export default async function OperatorHome() {
  const user = await requireUser();
  const lines = await listProductionLines();
  const withActive = await Promise.all(lines.map(async (l) => ({ line: l, active: await getActiveWorkOrderForLine(l.id) })));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Merhaba, {user.fullName.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Çalışacağınız hattı seçin.</p>
      </div>

      {lines.length === 0 ? (
        <EmptyState icon={Factory} title="Üretim hattı tanımlı değil" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {withActive.map(({ line, active }) => (
            <Link
              key={line.id}
              href={`/operator/${line.id}`}
              data-pressable
              className="flex min-h-40 flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 transition-transform active:scale-[0.98]"
            >
              <div>
                <div className="font-mono text-xs text-muted-foreground">{line.code}</div>
                <div className="text-base font-semibold">{line.name}</div>
              </div>
              {active ? (
                <div className="space-y-1.5">
                  <StatusBadge status={active.wo.status} kind="work_order" />
                  <div className="truncate text-sm text-muted-foreground">{active.product.name}</div>
                  {/* /uretim/hatlar kartıyla aynı anatomi: ilerleme çubuğu + üretilen/planlanan —
                      önceden bu ekranda yalnızca ürün adı vardı, hangi iş emrinde ne kadar
                      ilerlendiği operatörün hat seçmeden önce görebileceği bir bilgi değildi. */}
                  <Progress
                    value={D(active.wo.plannedQty).gt(0) ? Math.min(100, D(active.wo.producedQty).div(active.wo.plannedQty).mul(100).toNumber()) : 0}
                    className={cn('h-1.5', D(active.wo.producedQty).eq(0) && 'opacity-60')}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <QtyCell value={active.wo.producedQty} uom={active.uomCode} />
                    <QtyCell value={active.wo.plannedQty} uom={active.uomCode} />
                  </div>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Aktif iş emri yok</span>
              )}
              <div className="flex items-center justify-end text-primary">
                <ChevronRight className="size-5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

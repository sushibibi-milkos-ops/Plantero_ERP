import type { Metadata } from 'next';
import Link from 'next/link';
import { Factory, ChevronRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listProductionLines, getActiveWorkOrderForLine } from '@/modules/production/queries';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';

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
              className="flex min-h-32 flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 transition-transform active:scale-[0.98]"
            >
              <div>
                <div className="font-mono text-xs text-muted-foreground">{line.code}</div>
                <div className="text-base font-semibold">{line.name}</div>
              </div>
              {active ? (
                <div className="space-y-1">
                  <StatusBadge status={active.wo.status} kind="work_order" />
                  <div className="truncate text-sm text-muted-foreground">{active.product.name}</div>
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

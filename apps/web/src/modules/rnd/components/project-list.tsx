'use client';

import Link from 'next/link';
import { Kanban, FlaskConical, Target } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_LABELS } from '../labels';
import type { ProjectRow } from '../queries';

export function ProjectList({ projects }: { projects: ProjectRow[] }) {
  if (projects.length === 0) {
    return <EmptyState title="Henüz Ar-Ge projesi yok" description="Yeni bir proje oluşturup Trello mantığı board'u kullanmaya başlayın." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => {
        const status = PROJECT_STATUS_LABELS[p.status] ?? { label: p.status, tone: 'muted' as const };
        const overTarget = p.targetUnitCost && p.currentUnitCost && Number(p.currentUnitCost) > Number(p.targetUnitCost);
        return (
          <Link
            key={p.id}
            href={`/arge/projeler/${p.id}/board`}
            className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 transition-[transform,box-shadow] duration-150 ease-out hover:border-border hover:shadow-sm active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-muted-foreground">{p.code}</div>
                <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
              </div>
              <StatusBadge status={p.status} label={status.label} tone={status.tone} />
            </div>

            {p.goal ? <p className="line-clamp-2 text-[13px] text-muted-foreground">{p.goal}</p> : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Kanban className="size-3.5" /> {p.cardCount} kart / {p.columnCount} kolon</span>
              {p.productSku ? <span className="inline-flex items-center gap-1"><FlaskConical className="size-3.5" /> {p.productSku}</span> : p.targetSku ? <span className="inline-flex items-center gap-1"><Target className="size-3.5" /> {p.targetSku} (aday)</span> : null}
            </div>

            {(p.targetUnitCost || p.currentUnitCost) ? (
              <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-[12px]">
                <span className="text-muted-foreground">Birim maliyet</span>
                <div className="flex items-center gap-1.5">
                  {p.currentUnitCost ? <MoneyCell value={p.currentUnitCost} digits={2} className={cn('text-[13px] font-medium', overTarget && 'text-warning')} /> : <span className="text-muted-foreground">—</span>}
                  {p.targetUnitCost ? <span className="text-muted-foreground">/ hedef <MoneyCell value={p.targetUnitCost} digits={2} className="text-muted-foreground" /></span> : null}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{p.ownerName ?? 'Sahipsiz'}</span>
              {p.targetLaunchDate ? <span>Lansman {formatDate(p.targetLaunchDate)}</span> : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

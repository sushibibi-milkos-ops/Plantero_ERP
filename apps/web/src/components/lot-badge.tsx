'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getStatusInfo } from '@/lib/status';

const DOT: Record<string, string> = {
  quarantine: 'bg-warning',
  released: 'bg-success',
  rejected: 'bg-destructive',
  consumed: 'bg-muted-foreground/50',
  recalled: 'bg-destructive',
  expired: 'bg-destructive',
};

/**
 * Lot rozeti: mono lot no + durum noktası. `id` verilirse lot detayına bağlanır.
 * PL-260902-H1-01 gibi kodlar için tasarlandı; tedarikçi lotları da aynı biçimde.
 */
export function LotBadge({
  lotNo,
  status,
  id,
  href,
  className,
}: {
  lotNo: string | null | undefined;
  status?: string | null;
  id?: string;
  href?: string;
  className?: string;
}) {
  if (!lotNo) return <span className="text-xs text-muted-foreground">—</span>;
  const info = status ? getStatusInfo(status, 'lot') : null;
  const to = href ?? (id ? `/depo/lotlar/${id}` : undefined);
  const inner = (
    <span
      title={info ? `${lotNo} · ${info.label}` : lotNo}
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-1.5 font-mono text-[11px] tracking-tight whitespace-nowrap',
        to && 'hover:border-border hover:bg-muted',
        className,
      )}
    >
      {status ? <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[status] ?? 'bg-muted-foreground')} /> : null}
      {lotNo}
    </span>
  );
  return to ? (
    <Link href={to} className="inline-flex" onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

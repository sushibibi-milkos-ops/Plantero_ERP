import Link from 'next/link';
import { Lock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/status-badge';
import type { RoleOverview } from '../queries';

function RoleMeta({ role }: { role: RoleOverview }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Users className="size-3" />
      {role.userCount}
      {role.isLocked ? <Lock className="ml-0.5 size-3" aria-label="Kilitli" /> : null}
      {!role.isActive ? <StatusBadge status="inactive" label="Pasif" tone="muted" size="sm" dot={false} className="ml-0.5 h-4 px-1" /> : null}
    </span>
  );
}

/**
 * Rol seçici: masaüstünde dikey liste (sol panel), mobilde yatay kaydırılabilir çip şeridi
 * (kendi kabında kaydırır — sayfa yatay taşımaz). Seçim `?role=<id>` URL parametresiyle sunucu
 * tarafında yönetilir; istemci durumu yoktur.
 */
export function RoleList({ roles, selectedId }: { roles: RoleOverview[]; selectedId: string }) {
  return (
    <>
      <nav aria-label="Roller" className="hidden shrink-0 flex-col gap-0.5 md:flex md:w-64">
        {roles.map((r) => {
          const active = r.id === selectedId;
          return (
            <Link
              key={r.id}
              href={`/ayarlar/roller?role=${r.id}`}
              className={cn(
                'flex flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors',
                active ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn('truncate text-[13px] font-medium', !r.isActive && 'text-muted-foreground')}>{r.name}</span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="code truncate text-[11px] text-muted-foreground">{r.code}</span>
                <RoleMeta role={r} />
              </span>
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Roller" className="scrollbar-thin -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden">
        {roles.map((r) => {
          const active = r.id === selectedId;
          return (
            <Link
              key={r.id}
              href={`/ayarlar/roller?role=${r.id}`}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap',
                active ? 'border-primary/30 bg-primary text-primary-foreground' : 'border-border/70 bg-background text-foreground',
                !r.isActive && !active && 'text-muted-foreground',
              )}
            >
              {r.isLocked ? <Lock className="size-3.5" /> : null}
              {r.name}
              <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{r.userCount}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

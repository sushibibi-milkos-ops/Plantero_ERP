'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function ProjectNavTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/arge/projeler/${projectId}/board`, label: 'Board' },
    { href: `/arge/projeler/${projectId}/receteler`, label: 'Deneme reçeteleri' },
  ];
  return (
    <div className="flex gap-5 border-b border-border/60">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'relative -mb-px flex h-9 items-center text-[13px] font-medium transition-colors duration-150',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
          </Link>
        );
      })}
    </div>
  );
}

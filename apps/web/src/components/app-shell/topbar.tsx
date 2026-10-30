'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { matchNav, SUBPATH_LABELS } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationBell } from '@/components/notification-bell';
import { useShell } from './app-shell';
import { UserMenu } from './user-menu';

type Crumb = { label: string; href?: string };

/** Yol → breadcrumb parçaları. Bilinmeyen id segmentleri kısaltılarak gösterilir. */
export function buildCrumbs(pathname: string): Crumb[] {
  const match = matchNav(pathname);
  if (!match) return [{ label: 'Plantero' }];
  const { group, item } = match;
  const crumbs: Crumb[] = [];
  if (group.items.length > 1 || group.items[0]!.href !== item.href) {
    crumbs.push({ label: group.label, href: group.items[0]!.href });
  }
  crumbs.push({ label: item.label, href: item.href });
  const rest = pathname.slice(item.href.length).split('/').filter(Boolean);
  for (const seg of rest) {
    const known = SUBPATH_LABELS[seg];
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(seg) || /^\d+$/.test(seg);
    crumbs.push({ label: known ?? (isId ? 'Detay' : decodeURIComponent(seg)) });
  }
  // Son öğe bağlantısız
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;
  return crumbs;
}

export function Topbar() {
  const pathname = usePathname();
  const { setCommandOpen, setMobileMenuOpen } = useShell();
  const crumbs = buildCrumbs(pathname);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border px-3 md:px-6',
        // iPadOS gezinme çubuğu: yarı saydam materyal (zemin %72 + blur-xl + doygunluk) — içerik altından
        // bulanık kayar. `prefers-reduced-transparency`'de globals.css `.material` opaklaştırır.
        'material',
      )}
    >
      <Button variant="ghost" size="icon-sm" className="size-11 md:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="Menü">
        <Menu className="size-4" />
      </Button>

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap gap-1 text-[14px] sm:gap-1.5">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                <BreadcrumbItem className={cn(!last && 'hidden sm:inline-flex')}>
                  {c.href && !last ? (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="truncate font-semibold">{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {!last ? <BreadcrumbSeparator className="hidden sm:flex [&>svg]:size-3" /> : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className={cn(
          // iOS arama alanı: gri kapsül (#767680 @ %12), 10px köşe, lupe solda
          'hidden h-9 w-56 items-center gap-2 rounded-[10px] bg-fill px-3 text-[15px] text-muted-foreground transition-colors md:inline-flex lg:w-64',
          'hover:text-foreground',
        )}
        aria-label="Ara (⌘K)"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Ara veya git…</span>
        <kbd className="rounded-md bg-card/70 px-1.5 py-px font-mono text-[11px] text-muted-foreground">⌘K</kbd>
      </button>
      <Button variant="ghost" size="icon-sm" className="size-11 md:hidden" onClick={() => setCommandOpen(true)} aria-label="Ara">
        <Search className="size-4" />
      </Button>

      {/* Bildirim zili — docs/modules/bildirimler.md §2 (30 sn polling, sayaç) */}
      <NotificationBell />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}

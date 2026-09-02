'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isActivePath, type NavGroup } from '@/lib/nav';
import { Logotype } from '@/components/logotype';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useShell } from './app-shell';

const OPEN_GROUPS_KEY = 'plantero_nav_open';

function readOpenGroups(): string[] | null {
  try {
    const raw = localStorage.getItem(OPEN_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

/** Sol kenar çubuğu (md ve üstü). Daraltılmışsa yalnızca grup ikonları + açılır menü. */
export function Sidebar() {
  const { nav, collapsed, setCollapsed } = useShell();
  const pathname = usePathname();

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className={cn('flex h-12 items-center border-b border-sidebar-border/70', collapsed ? 'justify-center px-0' : 'px-4')}>
        <Logotype size="sm" compact={collapsed} href="/kokpit" />
      </div>

      <nav aria-label="Ana menü" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
        {collapsed ? <CollapsedGroups nav={nav} pathname={pathname} /> : <ExpandedGroups nav={nav} pathname={pathname} />}
      </nav>

      <div className={cn('flex items-center border-t border-sidebar-border/70 p-2', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed ? (
          <span className="px-2 text-[11px] text-muted-foreground">
            <kbd className="rounded border bg-background px-1 py-px font-mono text-[10px]">⌘B</kbd> daralt
          </span>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              aria-label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? 'Genişlet' : 'Daralt'} · ⌘B</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

function ExpandedGroups({ nav, pathname }: { nav: NavGroup[]; pathname: string }) {
  const activeGroupId = nav.find((g) => g.items.some((i) => isActivePath(pathname, i.href)))?.id;
  const [open, setOpen] = useState<string[] | null>(null);

  useEffect(() => {
    setOpen(readOpenGroups());
  }, []);

  const isOpen = (g: NavGroup) => (open === null ? g.id === activeGroupId || g.id === 'kokpit' : open.includes(g.id) || g.id === activeGroupId);

  const toggle = (id: string) => {
    const base = open ?? nav.filter(isOpen).map((g) => g.id);
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    setOpen(next);
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
    } catch {
      /* depolama kapalı olabilir */
    }
  };

  return (
    <ul className="space-y-0.5">
      {nav.map((group) => {
        const single = group.items.length === 1 && group.items[0]!.href === '/kokpit';
        if (single) {
          const item = group.items[0]!;
          return (
            <li key={group.id}>
              <NavLink href={item.href} icon={item.icon} label={item.label} active={isActivePath(pathname, item.href)} />
            </li>
          );
        }
        const opened = isOpen(group);
        const groupActive = group.id === activeGroupId;
        return (
          <li key={group.id} className="pt-0.5">
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={opened}
              className={cn(
                'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium',
                'hover:bg-sidebar-accent/70 hover:text-foreground',
                groupActive ? 'text-foreground' : 'text-sidebar-foreground',
              )}
            >
              <group.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="flex-1 truncate text-left">{group.label}</span>
              <ChevronDown
                className={cn('size-3.5 text-muted-foreground/70 transition-transform duration-150 ease-out', opened ? 'rotate-0' : '-rotate-90')}
              />
            </button>
            {opened ? (
              <ul className="mt-0.5 mb-1 ml-[15px] space-y-px border-l border-sidebar-border pl-2.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} label={item.label} active={isActivePath(pathname, item.href)} nested />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  nested,
}: {
  href: string;
  icon?: NavGroup['icon'];
  label: string;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md px-2 text-[13px]',
        nested ? 'h-7' : 'h-8 font-medium',
        'hover:bg-sidebar-accent/70 hover:text-foreground',
        active ? 'bg-sidebar-accent text-foreground' : 'text-sidebar-foreground',
      )}
    >
      {Icon ? <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.75} /> : null}
      <span className="truncate">{label}</span>
      {active && nested ? <span aria-hidden className="absolute top-1/2 -left-[13px] h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-primary" /> : null}
    </Link>
  );
}

function CollapsedGroups({ nav, pathname }: { nav: NavGroup[]; pathname: string }) {
  return (
    <ul className="flex flex-col items-center gap-0.5">
      {nav.map((group) => {
        const active = group.items.some((i) => isActivePath(pathname, i.href));
        const single = group.items.length === 1;
        const Icon = group.icon;
        const trigger = (
          <span
            className={cn(
              'grid size-9 place-items-center rounded-md',
              'hover:bg-sidebar-accent/70 hover:text-foreground',
              active ? 'bg-sidebar-accent text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        );
        if (single) {
          const item = group.items[0]!;
          return (
            <li key={group.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={item.href} aria-label={item.label} aria-current={active ? 'page' : undefined}>
                    {trigger}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            </li>
          );
        }
        return (
          <li key={group.id}>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={group.label}>
                      {trigger}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">{group.label}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-44">
                <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground uppercase">{group.label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {group.items.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className={cn(isActivePath(pathname, item.href) && 'bg-accent')}>
                      <item.icon className="size-4 text-muted-foreground" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}

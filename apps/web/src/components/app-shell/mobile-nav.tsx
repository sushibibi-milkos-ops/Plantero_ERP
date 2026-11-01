'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { canSee, isActivePath, MOBILE_TABS } from '@/lib/nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Logotype } from '@/components/logotype';
import { logout } from '@/modules/auth/actions';
import { useShell } from './app-shell';
import { roleLabel } from './user-menu';

/** Mobil: alt sekme çubuğu + tam menü sheet'i (md altı) */
export function MobileNav() {
  const pathname = usePathname();
  const { can, nav, user, mobileMenuOpen, setMobileMenuOpen } = useShell();
  const tabs = MOBILE_TABS.filter((t) => canSee(t, can)).slice(0, 4);

  return (
    <>
      <nav
        aria-label="Hızlı erişim"
        className={cn(
          // iPadOS sekme çubuğu: yarı saydam materyal (blur + doygunluk), üstte hairline.
          'material fixed inset-x-0 bottom-0 z-30 flex border-t border-border md:hidden',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {tabs.map((t) => {
          const active = isActivePath(pathname, t.href) || (t.href === '/depo/stok' && pathname.startsWith('/depo'));
          return (
            <Link
              key={t.href}
              href={t.href}
              data-pressable
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] leading-none font-medium tracking-[0.1px]',
                active ? 'text-(--ink-primary) dark:text-primary' : 'text-muted-foreground',
              )}
            >
              <t.icon className="size-6" strokeWidth={active ? 2.1 : 1.6} />
              {t.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] leading-none font-medium tracking-[0.1px] text-muted-foreground"
        >
          <LayoutGrid className="size-6" strokeWidth={1.6} />
          Menü
        </button>
      </nav>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs gap-0 p-0 ">
          <SheetHeader className="border-b border-border px-5 py-3.5">
            <SheetTitle asChild>
              <div>
                <Logotype size="sm" />
              </div>
            </SheetTitle>
            <div className="text-[13px] text-muted-foreground">
              {user.fullName} · {user.roles.map(roleLabel).join(', ')}
            </div>
          </SheetHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
            {nav.map((group) => (
              <div key={group.id} className="mb-2">
                <div className="px-3 pt-3 pb-1 text-[12px] font-medium tracking-[0.2px] text-muted-foreground uppercase">{group.label}</div>
                <ul>
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          data-pressable
                          className={cn(
                            'flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px]',
                            active ? 'bg-primary/15 font-medium text-(--ink-primary) dark:text-primary' : 'text-foreground/85',
                          )}
                        >
                          <item.icon className={cn('size-[18px]', active ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.75} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <form action={logout} className="border-t border-border p-3">
            <button type="submit" className="flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] text-destructive">
              <LogOut className="size-4" /> Çıkış yap
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

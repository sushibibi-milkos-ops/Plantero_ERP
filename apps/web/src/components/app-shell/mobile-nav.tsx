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
          // %85 opaklık altındaki form etiketleri/kanban kartlarının şeffaf camdan sızmasına yol
          // açıyordu (Tur 2 bulgusu); üst hairline zaten katman ayrımını sağlıyor, opaklığı /95'e
          // çıkarmak "kirli cam" etkisini keserken blur'u korur.
          'fixed inset-x-0 bottom-0 z-30 flex border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden',
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
                'flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <t.icon className="size-5" strokeWidth={active ? 2.2 : 1.75} />
              {t.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground"
        >
          <LayoutGrid className="size-5" strokeWidth={1.75} />
          Menü
        </button>
      </nav>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs gap-0 p-0 ease-drawer data-[state=closed]:duration-200 data-[state=open]:duration-300">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle asChild>
              <div>
                <Logotype size="sm" />
              </div>
            </SheetTitle>
            <div className="text-xs text-muted-foreground">
              {user.fullName} · {user.roles.map(roleLabel).join(', ')}
            </div>
          </SheetHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
            {nav.map((group) => (
              <div key={group.id} className="mb-2">
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group.label}</div>
                <ul>
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          data-pressable
                          className={cn(
                            'flex h-10 items-center gap-3 rounded-md px-2 text-sm',
                            active ? 'bg-accent font-medium text-foreground' : 'text-foreground/80',
                          )}
                        >
                          <item.icon className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.75} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <form action={logout} className="border-t border-border/60 p-2">
            <button type="submit" className="flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm text-destructive">
              <LogOut className="size-4" /> Çıkış yap
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

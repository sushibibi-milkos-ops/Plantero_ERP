'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { filterNav, makeCan, type NavGroup, type PermissionChecker } from '@/lib/nav';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { MobileNav } from './mobile-nav';
import { CommandMenu } from './command-menu';

export type ShellUser = {
  userId: string;
  userEmail: string;
  fullName: string;
  roles: string[];
  permissions: string[];
};

type ShellContextValue = {
  user: ShellUser;
  can: PermissionChecker;
  nav: NavGroup[];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  /** Odak modu: kesintiye kapalı, tek görevli akışlar (ör. depo toplama ekranı) kenar çubuğu +
   *  üst bar'ı kaldırır. `useFocusMode()` ile açılıp kapatılır (bkz. app-shell/use-focus-mode.ts). */
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell yalnızca AppShell içinde kullanılabilir');
  return ctx;
}

export const SIDEBAR_COOKIE = 'plantero_sidebar';

/**
 * Uygulama kabuğu: sol kenar çubuğu + üst bar + mobil alt sekmeler + ⌘K.
 * Daraltma durumu cookie'de tutulur (SSR'da doğru genişlikle gelir, zıplama olmaz).
 */
export function AppShell({
  user,
  initialCollapsed,
  children,
}: {
  user: ShellUser;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsedState] = useState(initialCollapsed);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const can = useMemo(() => makeCan(user.roles, user.permissions), [user.roles, user.permissions]);
  const nav = useMemo(() => filterNav(can), [can]);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    document.cookie = `${SIDEBAR_COOKIE}=${v ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  // Rota değişince mobil menüyü kapat. Odak modunu burada sıfırlamıyoruz — `useFocusMode()` kendi
  // unmount temizliğiyle kapatır (bkz. use-focus-mode.ts); pathname'e bağlarsak aynı commit'te
  // hem hook'un "aç" efekti hem buradaki "kapat" efekti yarışır ve sıralama garantisiz olur.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Klavye: ⌘K arama, ⌘B / [ kenar çubuğu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !typing) {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, setCollapsed]);

  const value = useMemo<ShellContextValue>(
    () => ({ user, can, nav, collapsed, setCollapsed, commandOpen, setCommandOpen, mobileMenuOpen, setMobileMenuOpen, focusMode, setFocusMode }),
    [user, can, nav, collapsed, setCollapsed, commandOpen, mobileMenuOpen, focusMode],
  );

  // Odak modu: kenar çubuğu, üst bar ve mobil sekmeler kalkar; içerik viewport'un tamamını kullanır.
  // Toplama/sayım gibi kesintiye kapalı tek görevli akışlar için (docs bulgusu: 900px+ boşa giden
  // masaüstü alanı). CommandMenu (⌘K) kasıtlı olarak açık kalır — klavye kısayolları her yerde çalışır.
  if (focusMode) {
    return (
      <ShellContext.Provider value={value}>
        <div className="min-h-dvh bg-background">
          <main id="main" className="min-h-dvh px-4 py-4 md:px-6 md:py-6">{children}</main>
        </div>
        <CommandMenu />
      </ShellContext.Provider>
    );
  }

  return (
    <ShellContext.Provider value={value}>
      <div className="flex min-h-dvh bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
          <Topbar />
          {/* pb-32 (128px) mobilde: FormActions (sticky bottom-16, ~52px) + MobileNav (fixed bottom-0,
              h-14=56px) alt 116px'i kaplıyor — eski pb-24 (96px) 20px kısa kalıp formun son alanlarını
              (ör. "Müşteri sipariş no") tab bar'ın altında bırakıyordu (Tur 2 bulgusu). */}
          <main id="main" className="flex-1 px-4 pt-4 pb-32 md:px-6 md:pt-6 md:pb-10">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
        <MobileNav />
        <CommandMenu />
      </div>
    </ShellContext.Provider>
  );
}

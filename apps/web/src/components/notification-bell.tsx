'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getUnreadCountAction } from '@/modules/notifications/actions';

/**
 * Üst bar bildirim zili — 30 sn polling (docs/modules/bildirimler.md §2, gerçek zamanlı gerekmez).
 * `app-shell/topbar.tsx` içinde `<ThemeToggle />`'ın yanına bağlıdır; sayaç `getUnreadCountAction`
 * (oturumdaki kullanıcının okunmamış in_app bildirimleri) üzerinden gelir, tıklanınca `/bildirimler`.
 */
export function NotificationBell({ className }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    getUnreadCountAction()
      .then((n) => setCount(n))
      .catch(() => setCount((c) => c)); // sessizce yoksay — zil sayaç göstermeden çalışmaya devam eder
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const hasUnread = Boolean(count && count > 0);

  return (
    // Kök neden (Tur 20 P1, shell-topbar-touch-01): sabit `size-9` (36px) her viewport'ta aynı
    // kaldığı için mobilde 44px dokunma hedefinin altındaydı. Komşu ThemeToggle'ın zaten kullandığı
    // desenle aynı: mobilde `size-11` (44px dokunma hedefi), md ve üstünde eski görsel boyuta yakın
    // `size-8` (32px, ikon kendi boyutunda ortalanmış kalır — davranış/masaüstü görünümü değişmez).
    <Button variant="ghost" size="icon-sm" className={cn('relative size-11 md:size-8', className)} asChild aria-label={hasUnread ? `Bildirimler (${count} okunmamış)` : 'Bildirimler'}>
      <Link href="/bildirimler">
        <Bell className="size-4" />
        {hasUnread ? (
          <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-semibold text-white tabular-nums">
            {count! > 9 ? '9+' : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

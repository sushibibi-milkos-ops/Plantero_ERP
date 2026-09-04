'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getUnreadCountAction } from '@/modules/notifications/actions';

/**
 * Üst bar bildirim zili — 30 sn polling (docs/modules/bildirimler.md §2, gerçek zamanlı gerekmez).
 * ORTAK BİLEŞEN (`apps/web/src/components/**`): mevcut hiçbir dosya değiştirilmedi, bu YENİ bir
 * dosya. `topbar.tsx` (app-shell, benim yazma kapsamımın dışında) bu bileşeni henüz İÇE AKTARMIYOR —
 * raporun "ortak bileşen talepleri" bölümünde `sharedComponentRequests` olarak belirtildi. Şimdilik
 * `/bildirimler` sayfasının kendisi ve bu bileşen bağımsız çalışır durumdadır; kabuk sahibi
 * `<NotificationBell />`'i `topbar.tsx`de `<ThemeToggle />`'ın yanına eklediğinde otomatik aktif olur.
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
    <Button variant="ghost" size="icon-sm" className={cn('relative size-9', className)} asChild aria-label={hasUnread ? `Bildirimler (${count} okunmamış)` : 'Bildirimler'}>
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

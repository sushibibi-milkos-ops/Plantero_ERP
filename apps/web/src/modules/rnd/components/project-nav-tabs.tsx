'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function ProjectNavTabs({ projectId, trailing }: { projectId: string; trailing?: React.ReactNode }) {
  const pathname = usePathname();
  // Etiketler breadcrumb (nav.ts SUBPATH_LABELS) ve sidebar (NAV) ile BİREBİR aynı olmalı — 'Board'
  // (İngilizce) ve küçük harfli 'Deneme reçeteleri' aynı ekranın iki farklı adı gibi duruyordu
  // (Tur 1 P1 arge-board-03).
  const tabs = [
    { href: `/arge/projeler/${projectId}/board`, label: 'Pano' },
    { href: `/arge/projeler/${projectId}/receteler`, label: 'Deneme Reçeteleri' },
  ];
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60">
      <div className="flex gap-5">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                // px-0.5 (kök neden düzeltmesi, Tur 5 P2 arge-board-15): "Pano" gibi kısa etiketlerde
                // metnin kendi intrinsic genişliği (~31px) dokunma hedefi genişlik eşiğinin (44px)
                // altında kalıyordu — h-11 zaten YÜKSEKLİĞİ karşılıyordu ama GENİŞLİK boştaydı. Yatay
                // dolgu (px-2, toplam +16px) tutamacı büyütür, alt çizgi (`-bottom-px` işaretçi) ve
                // `-mb-px` hizası değişmez (dolgu içeriye, kenarlığa göre konum sabit kalır).
                // h-11 md:h-9: 390px'te gerçek 44px dokunma hedefi (Tur 2 P1 arge-board-10) — masaüstünde eski boyut.
                'relative -mb-px flex h-11 items-center px-2 text-[13px] font-medium transition-colors duration-150 md:h-9 md:px-0.5',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary md:inset-x-0.5" /> : null}
            </Link>
          );
        })}
      </div>
      {trailing ? <div className="shrink-0 pb-2 md:pb-1.5">{trailing}</div> : null}
    </div>
  );
}

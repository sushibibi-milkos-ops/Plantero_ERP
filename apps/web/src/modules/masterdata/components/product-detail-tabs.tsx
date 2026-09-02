'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type ProductTabDef = { value: string; label: string; content: React.ReactNode };
export type DetailTabDef = ProductTabDef;

/** Genel amaçlı detay sekmeleri — durum URL'de (?tab=) tutulur, geri/ileri ve paylaşılabilir bağlantıyla uyumlu. Ürün, cari, reçete detaylarında kullanılır. */
export function DetailTabs({ tabs, defaultTab }: { tabs: ProductTabDef[]; defaultTab: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get('tab') ?? defaultTab;
  const value = tabs.some((t) => t.value === active) ? active : defaultTab;

  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        if (v === defaultTab) params.delete('tab');
        else params.set('tab', v);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList variant="line" className="w-max min-w-full justify-start border-b border-border/60 md:w-fit md:min-w-0">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={cn('shrink-0')}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="pt-4">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

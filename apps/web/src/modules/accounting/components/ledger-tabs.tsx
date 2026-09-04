'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * VUK/UFRS defter seçici — `?ledger=` sorgu parametresiyle senkron (finans modülündeki
 * `ScenarioSelect` ile aynı kalıp: `cashflow-toolbar.tsx`). Aktif defter URL'de tutulduğu için
 * sayfa başlığındaki "CSV indir" eylemi (`mizan/page.tsx` PageHeader actions, tamamen sunucuda
 * render edilir) her zaman doğru defteri gösterir — iki bileşen ayrı client instance olsa da
 * aynı URL kaynağını okur, prop drilling ya da context gerekmez.
 */
export function LedgerTabs({ ledger, vuk, ufrs }: { ledger: 'VUK' | 'UFRS'; vuk: React.ReactNode; ufrs: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('ledger', v);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Tabs value={ledger} onValueChange={onChange}>
      <TabsList variant="line">
        <TabsTrigger value="VUK">VUK</TabsTrigger>
        <TabsTrigger value="UFRS">UFRS</TabsTrigger>
      </TabsList>
      <TabsContent value="VUK" className="mt-3">{vuk}</TabsContent>
      <TabsContent value="UFRS" className="mt-3">{ufrs}</TabsContent>
    </Tabs>
  );
}

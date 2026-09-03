'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateInput } from '@/components/form/date-field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Özel tarih aralığı filtresi: native `<input type="date">` tarayıcı/OS yereline göre yer tutucu
 * çiziyordu (çoğu tarayıcıda mm/dd/yyyy) — sayfadaki etiket "gg.aa.yyyy" derken görünen alan
 * "mm/dd/yyyy" gösteriyordu, aynı ekranda iki format çelişiyordu (Tur 3 bulgusu). Paylaşılan
 * `DateInput` (sipariş formundaki tarih alanıyla birebir aynı bileşen) her tarayıcıda her zaman
 * gg.aa.yyyy metni gösterir; native GET formuna bağlanamadığı için (yazılabilir metin alanı, ISO
 * değeri yalnızca commit'te üretir) gönderim istemci yönlendirmesiyle yapılır.
 */
export function NetRevenueDateRange({ from, to, active }: { from: string; to: string; active: boolean }) {
  const router = useRouter();
  const [fromIso, setFromIso] = useState<string | null>(active ? from : null);
  const [toIso, setToIso] = useState<string | null>(active ? to : null);

  function apply() {
    if (!fromIso || !toIso) return;
    router.push(`/satis/net-ciro?period=custom&from=${fromIso}&to=${toIso}`);
  }

  return (
    <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
      <div className="flex w-full items-center gap-1.5 sm:w-auto">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:w-36 sm:flex-none">
          <label className="text-[11px] text-muted-foreground">Başlangıç</label>
          <DateInput value={fromIso} onChange={setFromIso} toDate={toIso ? new Date(toIso) : undefined} />
        </div>
        <span className="shrink-0 self-end pb-2 text-xs text-muted-foreground">–</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:w-36 sm:flex-none">
          <label className="text-[11px] text-muted-foreground">Bitiş</label>
          <DateInput value={toIso} onChange={setToIso} fromDate={fromIso ? new Date(fromIso) : undefined} />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={active ? 'default' : 'outline'}
        onClick={apply}
        disabled={!fromIso || !toIso}
        className={cn('h-8 w-full sm:w-auto')}
      >
        Uygula
      </Button>
    </div>
  );
}

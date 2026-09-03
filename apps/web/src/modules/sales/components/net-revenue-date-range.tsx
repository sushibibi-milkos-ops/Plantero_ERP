'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { DateInput } from '@/components/form/date-field';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Özel tarih aralığı filtresi: native `<input type="date">` tarayıcı/OS yereline göre yer tutucu
 * çiziyordu (çoğu tarayıcıda mm/dd/yyyy) — sayfadaki etiket "gg.aa.yyyy" derken görünen alan
 * "mm/dd/yyyy" gösteriyordu, aynı ekranda iki format çelişiyordu (Tur 3 bulgusu). Paylaşılan
 * `DateInput` (sipariş formundaki tarih alanıyla birebir aynı bileşen) her tarayıcıda her zaman
 * gg.aa.yyyy metni gösterir; native GET formuna bağlanamadığı için (yazılabilir metin alanı, ISO
 * değeri yalnızca commit'te üretir) gönderim istemci yönlendirmesiyle yapılır.
 *
 * Tur 5 P1 bulgusu: varsayılan görünümde (period≠'custom') iki boş tarih alanı + kalıcı devre dışı
 * "Uygula" düğmesi filtre çubuğunun 7 kontrolünden 3'ünü "ölü piksel" yapıyordu. Artık ikisi (alanlar
 * + düğme) tek bir "Özel aralık" popover tetikleyicisinin ARKASINA alınır — preset çipleriyle aynı
 * anatomi (h-8) — varsayılan çubukta yalnızca canlı kontroller kalır.
 */
export function NetRevenueDateRange({ from, to, active }: { from: string; to: string; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromIso, setFromIso] = useState<string | null>(active ? from : null);
  const [toIso, setToIso] = useState<string | null>(active ? to : null);

  function apply() {
    if (!fromIso || !toIso) return;
    router.push(`/satis/net-ciro?period=custom&from=${fromIso}&to=${toIso}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium',
            active ? 'bg-primary text-primary-foreground' : 'border border-border/70 bg-background hover:bg-accent',
          )}
        >
          <CalendarRange className="size-3.5" />
          {active ? `${formatDate(from)} – ${formatDate(to)}` : 'Özel aralık'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex items-end gap-1.5">
          <div className="flex w-36 flex-col gap-0.5">
            <label className="text-[11px] text-muted-foreground">Başlangıç</label>
            <DateInput value={fromIso} onChange={setFromIso} toDate={toIso ? new Date(toIso) : undefined} />
          </div>
          <span className="shrink-0 self-end pb-2 text-xs text-muted-foreground">–</span>
          <div className="flex w-36 flex-col gap-0.5">
            <label className="text-[11px] text-muted-foreground">Bitiş</label>
            <DateInput value={toIso} onChange={setToIso} fromDate={fromIso ? new Date(fromIso) : undefined} />
          </div>
        </div>
        <Button type="button" size="sm" onClick={apply} disabled={!fromIso || !toIso} className="mt-2 h-8 w-full">
          Uygula
        </Button>
      </PopoverContent>
    </Popover>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { closeFiscalPeriodAction, openFiscalPeriodAction } from '../actions';

export function PeriodToggleButton({
  code,
  isClosed,
  className,
  revealOnHover = false,
}: {
  code: string;
  isClosed: boolean;
  className?: string;
  /** Masaüstü tablo satırı içi kullanım: `ghost` + yalnız satır hover/odakta görünür (kritik bulgu,
   *  kriter 11 — bkz. fiscal-periods-table.tsx `group` tr). Mobil kartta HER ZAMAN görünür kalır
   *  (dokunma cihazında hover kavramı yok) — bu yüzden varsayılan `false`. */
  revealOnHover?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const res = isClosed ? await openFiscalPeriodAction({ code }) : await closeFiscalPeriodAction({ code });
    setPending(false);
    if (res.ok) {
      toast.success(isClosed ? `${code} dönemi yeniden açıldı` : `${code} dönemi kapatıldı`);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Button
      variant={revealOnHover ? 'ghost' : 'outline'}
      size="sm"
      onClick={toggle}
      disabled={pending}
      className={cn(
        revealOnHover &&
          // 11 satırın 11'inde sürekli görünen çerçeveli düğme, DataTable satır eylem menüsüyle
          // (yalnız hover/odakta beliren) çelişen ikinci bir kalıp oluşturuyordu (kritik bulgu,
          // kriter 11). opacity-0→100 yalnızca transform/opacity kullanır (transition-all yasak);
          // group-focus-within klavyeyle Tab'lanınca da düğmeyi görünür kılar (yalnız hover'a
          // bağlı kalsaydı klavye kullanıcısı düğmeyi hiç göremezdi).
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
        className,
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : isClosed ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
      {isClosed ? 'Yeniden aç' : 'Kapat'}
    </Button>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { closeFiscalPeriodAction, openFiscalPeriodAction } from '../actions';

export function PeriodToggleButton({ code, isClosed, className }: { code: string; isClosed: boolean; className?: string }) {
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
    <Button variant="outline" size="sm" onClick={toggle} disabled={pending} className={cn(className)}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : isClosed ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
      {isClosed ? 'Yeniden aç' : 'Kapat'}
    </Button>
  );
}

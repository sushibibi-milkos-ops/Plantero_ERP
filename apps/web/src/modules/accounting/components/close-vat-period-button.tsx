'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Calculator, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { closeVatPeriodAction } from '../actions';

export function CloseVatPeriodButton({ computablePeriods }: { computablePeriods: string[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [period, setPeriod] = useState(computablePeriods[0] ?? '');
  const [pending, setPending] = useState(false);

  async function run() {
    if (!period) return;
    setPending(true);
    const res = await closeVatPeriodAction({ period });
    setPending(false);
    if (res.ok) {
      toast.success(res.data.skipped ? `${period} zaten hesaplanmıştı` : `${period} dönemi hesaplandı`);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* data-[size=default]:h-11 md:...:h-9 (kritik bulgu, muhasebe-mobil-buton-01): fields.tsx
          FormSelect ile aynı kalıp — 390px'te varsayılan 36px, 44px hedefinin altındaydı. */}
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-32 data-[size=default]:h-11 md:data-[size=default]:h-9"><SelectValue placeholder="Dönem" /></SelectTrigger>
        <SelectContent>
          {computablePeriods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button onClick={run} disabled={pending || !period}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />} Dönemi hesapla</Button>
    </div>
  );
}

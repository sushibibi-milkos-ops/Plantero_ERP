'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Calculator, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { computeSupplierScoresAction } from '../actions';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function ComputeScoreButton() {
  const [period, setPeriod] = useState(currentPeriod());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const res = await computeSupplierScoresAction({ period });
      if (res.ok) { toast.success(`${res.data.count} tedarikçi için ${period} skoru hesaplandı`); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-11 w-40 text-[13px] md:h-9" aria-label="Dönem" />
      <Button onClick={run} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />} Skoru Hesapla
      </Button>
    </div>
  );
}

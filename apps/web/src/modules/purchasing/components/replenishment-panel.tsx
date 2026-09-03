'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { runReplenishmentAction } from '../actions';
import { CriticalStockTable } from './critical-stock-table';
import type { CriticalStockRow } from '../queries';

/** "Motoru çalıştır" + "sadece kritik" filtresi + tablo — tek bir client kabuğu (docs/modules/depo.md
 * kalıbı: filtre çubuğu üstte, tablo altta). */
export function ReplenishmentPanel({ rows, canRun }: { rows: CriticalStockRow[]; canRun: boolean }) {
  const [onlyCritical, setOnlyCritical] = useState(true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const res = await runReplenishmentAction();
      if (res.ok) {
        const { evaluated, suggested, autoOrdered, draftedOrders } = res.data;
        toast.success(
          suggested === 0
            ? `Motor çalıştı: ${evaluated} kural değerlendirildi, kritik kalem yok`
            : `Motor çalıştı: ${suggested} kritik kalem, ${draftedOrders} taslak sipariş (${autoOrdered} otomatik gönderildi)`,
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={onlyCritical} onCheckedChange={(v) => setOnlyCritical(v === true)} id="only-critical" />
          <Label htmlFor="only-critical" className="text-sm font-normal">Sadece kritik/uyarı</Label>
        </label>
        {canRun ? (
          <Button onClick={run} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            Motoru çalıştır
          </Button>
        ) : null}
      </div>
      <CriticalStockTable rows={rows} onlyCritical={onlyCritical} />
    </div>
  );
}

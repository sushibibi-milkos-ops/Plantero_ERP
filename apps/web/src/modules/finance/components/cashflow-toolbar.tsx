'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { recomputeCashflowAction } from '../cashflow-actions';

const SCENARIO_LABELS: Record<string, string> = { base: 'Baz senaryo', optimistic: 'İyimser (×1,15)', pessimistic: 'Kötümser (×0,85)' };

export function ScenarioSelect({ scenario, paramName = 'senaryo' }: { scenario: string; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={scenario}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(paramName, v);
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-44" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(SCENARIO_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RecomputeCashflowButton({ scenario }: { scenario: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await recomputeCashflowAction({ scenario });
          if (res.ok) {
            toast.success(`Projeksiyon yeniden hesaplandı (${res.data.count} ay)`);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      Yeniden hesapla
    </Button>
  );
}

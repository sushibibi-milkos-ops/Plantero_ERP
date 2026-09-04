'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { fetchTodayRatesAction } from '../actions';

export function FetchRatesButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await fetchTodayRatesAction();
          if (res.ok) {
            toast.success(`Bugünün kurları çekildi (${res.data.count} para birimi${res.data.mode === 'sandbox' ? ', sandbox' : ''})`);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Bugünü çek
    </Button>
  );
}

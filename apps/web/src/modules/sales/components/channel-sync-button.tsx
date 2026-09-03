'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncChannelOrdersAction } from '../actions';

export function ChannelSyncButton({ channelCode }: { channelCode: 'TRENDYOL' | 'HEPSIBURADA' }) {
  const [pending, startTransition] = useTransition();

  function sync() {
    startTransition(async () => {
      const res = await syncChannelOrdersAction({ channelCode });
      if (res.ok) {
        toast.success(`${res.data.fetched} sipariş bulundu · ${res.data.converted} dönüştürüldü${res.data.errors ? ` · ${res.data.errors} hata` : ''}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={pending} className="h-8">
      <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
      Şimdi senkronize et
    </Button>
  );
}

'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncChannelOrdersAction } from '../actions';

export function ChannelSyncButton({ channelCode, compact = false }: { channelCode: 'TRENDYOL' | 'HEPSIBURADA'; compact?: boolean }) {
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

  // Tablo satırında (compact): yalnızca ikon + title tooltip — metinli dolu buton satır eylemi için
  // Linear tabloya göre çok gösterişli. Diğer yerlerde (kanal ayarları vb.) tam metinli buton kalır.
  if (compact) {
    return (
      <Button variant="ghost" size="icon-sm" onClick={sync} disabled={pending} title="Şimdi senkronize et" aria-label="Şimdi senkronize et">
        <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={pending} className="h-8">
      <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
      Şimdi senkronize et
    </Button>
  );
}

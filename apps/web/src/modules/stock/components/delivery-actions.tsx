'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Layers, Truck, PackageCheck, FileText, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reserveFefoAction, shipDeliveryAction, markDeliveredAction } from '../actions';

export function DeliveryActions({ deliveryId, status, canPick }: { deliveryId: string; status: string; canPick: boolean }) {
  const [pending, startTransition] = useTransition();

  if (!canPick) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' ? (
        <Button onClick={() => run(() => reserveFefoAction({ id: deliveryId }), 'FEFO ile rezerve edildi')} disabled={pending}>
          <Layers className="size-4" /> FEFO ile rezerve et
        </Button>
      ) : null}
      {status === 'reserved' || status === 'picking' ? (
        <Button asChild>
          <Link href={`/depo/sevkiyat/${deliveryId}/topla`}>
            <ClipboardList className="size-4" /> Toplama ekranı
          </Link>
        </Button>
      ) : null}
      {status === 'picked' || status === 'reserved' ? (
        // 'reserved'de "Toplama ekranı" zaten birincil aksiyon olarak gösteriliyor (yukarıda) —
        // ikisi aynı ağırlıkta olursa hangisinin beklenen sıradaki adım olduğu belirsizleşir.
        // 'picked'de Toplama ekranı gösterilmediği için Sevk et tek başına birincil kalır.
        <Button variant={status === 'reserved' ? 'outline' : 'default'} onClick={() => run(() => shipDeliveryAction({ id: deliveryId }), 'Sevk edildi')} disabled={pending}>
          <Truck className="size-4" /> Sevk et
        </Button>
      ) : null}
      {status === 'shipped' ? (
        <Button onClick={() => run(() => markDeliveredAction({ id: deliveryId }), 'Teslim edildi olarak işaretlendi')} disabled={pending}>
          <PackageCheck className="size-4" /> Teslim edildi
        </Button>
      ) : null}
      {status === 'shipped' || status === 'delivered' ? (
        <Button variant="outline" onClick={() => toast.info('e-İrsaliye entegrasyonu sandbox modunda — GİB gönderimi simüle edildi.')}>
          <FileText className="size-4" /> e-İrsaliye
        </Button>
      ) : null}
    </div>
  );
}

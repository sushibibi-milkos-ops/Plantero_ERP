'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createInvoiceFromDeliveryAction } from '../actions';

export function DeliveryInvoiceButton({ deliveryId }: { deliveryId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function invoice() {
    startTransition(async () => {
      const res = await createInvoiceFromDeliveryAction({ deliveryId });
      if (res.ok) {
        toast.success(`Fatura kesildi: ${res.data.docNo}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button size="sm" variant="outline" className="h-7" onClick={invoice} disabled={pending}>
      {pending ? <Loader2 className="size-3 animate-spin" /> : <ReceiptText className="size-3" />} Fatura oluştur
    </Button>
  );
}

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { confirmOrderAction, cancelOrderAction, createInvoiceFromOrderAction } from '../actions';

export function OrderActions({ id, status, hasDeliveries }: { id: string; status: string; hasDeliveries: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await confirmOrderAction({ id });
      if (res.ok) {
        if (res.data.warnings.length) {
          toast.warning(`Sipariş onaylandı; ${res.data.warnings.length} satırda stok uyarısı var`, { description: res.data.warnings.join(' · ') });
        } else {
          toast.success(`Sipariş onaylandı; irsaliye taslağı ${res.data.deliveryDocNo} açıldı`);
        }
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function invoiceWithoutDelivery() {
    startTransition(async () => {
      const res = await createInvoiceFromOrderAction({ orderId: id });
      if (res.ok) {
        toast.success(`Fatura kesildi: ${res.data.docNo}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' ? (
        <Button size="sm" onClick={confirm} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Onayla
        </Button>
      ) : null}
      {['confirmed', 'partially_delivered', 'delivered'].includes(status) ? (
        <Button size="sm" variant="outline" onClick={invoiceWithoutDelivery} disabled={pending}>
          <ReceiptText className="size-3.5" /> Teslimatsız fatura
        </Button>
      ) : null}
      {status === 'draft' && !hasDeliveries ? (
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive"><XCircle className="size-3.5" /> İptal et</Button>}
          title="Sipariş iptal edilsin mi?"
          description="Bu işlem geri alınamaz."
          destructive
          onConfirm={async () => {
            const res = await cancelOrderAction({ id });
            if (res.ok) router.refresh();
            return res;
          }}
        />
      ) : null}
    </div>
  );
}

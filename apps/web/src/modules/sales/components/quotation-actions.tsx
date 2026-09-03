'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, CheckCircle2, ArrowRightCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { sendQuotationAction, acceptQuotationAction, convertQuotationToOrderAction, cancelOrderAction } from '../actions';

export function QuotationActions({ id, status, canOrder }: { id: string; status: string; canOrder: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, successMsg: string, after?: (data: unknown) => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(successMsg);
        after?.(res.data);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' ? (
        <Button size="sm" onClick={() => run(() => sendQuotationAction({ id }), 'Teklif gönderildi')} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Gönder
        </Button>
      ) : null}
      {(status === 'draft' || status === 'sent') ? (
        <Button size="sm" variant="outline" onClick={() => run(() => acceptQuotationAction({ id }), 'Teklif kabul edildi olarak işaretlendi')} disabled={pending}>
          <CheckCircle2 className="size-3.5" /> Kabul edildi
        </Button>
      ) : null}
      {canOrder ? (
        <Button
          size="sm"
          onClick={() => run(() => convertQuotationToOrderAction({ id }), 'Sipariş oluşturuldu', (data) => {
            const d = data as { id: string } | undefined;
            if (d?.id) router.push(`/satis/siparisler/${d.id}`);
          })}
          disabled={pending}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightCircle className="size-3.5" />} Siparişe dönüştür
        </Button>
      ) : null}
      {!['lost', 'cancelled'].includes(status) ? (
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive"><XCircle className="size-3.5" /> Kaybedildi işaretle</Button>}
          title="Teklif kaybedildi olarak işaretlensin mi?"
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

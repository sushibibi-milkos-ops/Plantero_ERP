'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { CheckCircle2, XCircle, Send, Ban, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { approvePurchaseOrderAction, rejectPurchaseOrderAction, sendPurchaseOrderAction, cancelPurchaseOrderAction } from '../actions';

export function OrderActions({ orderId, status, canApprove, canSend }: { orderId: string; status: string; canApprove: boolean; canSend: boolean }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const approvable = ['draft', 'ai_draft', 'pending_approval'].includes(status);
  const sendable = status === 'approved';
  const receivable = ['sent', 'confirmed', 'partially_received'].includes(status);
  const cancellable = !['cancelled', 'rejected', 'received', 'invoiced', 'closed'].includes(status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canApprove && approvable ? (
        <Button
          variant="outline"
          onClick={async () => {
            const res = await approvePurchaseOrderAction({ id: orderId });
            if (res.ok) toast.success('Sipariş onaylandı');
            else toast.error(res.error);
          }}
        >
          <CheckCircle2 className="size-4" /> Onayla
        </Button>
      ) : null}

      {canApprove && approvable ? (
        <>
          <ConfirmDialog
            open={rejectOpen}
            onOpenChange={setRejectOpen}
            title="Siparişi reddet"
            description="Taslak/onay bekleyen sipariş reddedilir; tedarikçiye gönderilmez."
            confirmLabel="Reddet"
            destructive
            onConfirm={async () => {
              const res = await rejectPurchaseOrderAction({ id: orderId, reason: reason || null });
              if (res.ok) toast.success('Sipariş reddedildi');
              return res.ok ? undefined : { ok: false, error: res.error };
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-[13px]">Gerekçe (opsiyonel)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </ConfirmDialog>
          <Button variant="outline" onClick={() => setRejectOpen(true)}>
            <XCircle className="size-4" /> Reddet
          </Button>
        </>
      ) : null}

      {canSend && sendable ? (
        <Button
          onClick={async () => {
            const res = await sendPurchaseOrderAction({ id: orderId });
            if (res.ok) toast.success('Sipariş tedarikçiye gönderildi');
            else toast.error(res.error);
          }}
        >
          <Send className="size-4" /> Tedarikçiye gönder
        </Button>
      ) : null}

      {receivable ? (
        <Button variant="outline" asChild>
          <Link href={`/depo/mal-kabul/yeni?po=${orderId}`}>
            <PackagePlus className="size-4" /> Mal kabul oluştur
          </Link>
        </Button>
      ) : null}

      {canApprove && cancellable ? (
        <>
          <ConfirmDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title="Siparişi iptal et"
            description="Sipariş iptal edilir; bu işlem geri alınamaz."
            confirmLabel="İptal et"
            destructive
            onConfirm={async () => {
              const res = await cancelPurchaseOrderAction({ id: orderId, reason: reason || null });
              if (res.ok) toast.success('Sipariş iptal edildi');
              return res.ok ? undefined : { ok: false, error: res.error };
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-[13px]">Gerekçe (opsiyonel)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </ConfirmDialog>
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setCancelOpen(true)}>
            <Ban className="size-4" /> İptal et
          </Button>
        </>
      ) : null}
    </div>
  );
}

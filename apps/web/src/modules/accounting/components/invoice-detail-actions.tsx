'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Undo2, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sendEInvoiceAction, createCreditNoteAction, cancelInvoiceAction } from '../actions';

export function InvoiceDetailActions({
  invoiceId,
  canCredit,
  canCancel,
  canSendEInvoice,
}: {
  invoiceId: string;
  canCredit: boolean;
  canCancel: boolean;
  canSendEInvoice: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditReason, setCreditReason] = useState('');
  const [creditPending, setCreditPending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPending, setCancelPending] = useState(false);

  async function sendEInvoice() {
    setSending(true);
    const res = await sendEInvoiceAction({ invoiceId });
    setSending(false);
    if (res.ok) {
      toast.success(`e-Belge gönderildi: ${res.data.eInvoiceStatus === 'accepted' ? 'kabul edildi' : res.data.eInvoiceStatus}`);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  async function submitCredit() {
    if (creditReason.trim().length < 3) { toast.error('Gerekçe girin'); return; }
    setCreditPending(true);
    const res = await createCreditNoteAction({ invoiceId, reason: creditReason.trim() });
    setCreditPending(false);
    if (res.ok) {
      toast.success(`İade faturası kesildi: ${res.data.docNo}`);
      setCreditOpen(false);
      startTransition(() => router.push(`/muhasebe/faturalar/${res.data.id}`));
    } else {
      toast.error(res.error);
    }
  }

  async function submitCancel() {
    setCancelPending(true);
    const res = await cancelInvoiceAction({ invoiceId, reason: cancelReason.trim() || null });
    setCancelPending(false);
    if (res.ok) {
      toast.success('Fatura iptal edildi');
      setCancelOpen(false);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSendEInvoice ? (
        <Button variant="outline" size="sm" onClick={sendEInvoice} disabled={sending}>
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} e-Fatura gönder
        </Button>
      ) : null}
      {canCredit ? (
        <Button variant="outline" size="sm" onClick={() => setCreditOpen(true)}>
          <Undo2 className="size-3.5" /> İade faturası
        </Button>
      ) : null}
      {canCancel ? (
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
          <Ban className="size-3.5" /> İptal et
        </Button>
      ) : null}

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>İade faturası kes</DialogTitle>
            <DialogDescription>Fatura tam tutarıyla tersine çevrilir (610/391 borç, 120.cari alacak); kaynağa bağlanır.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="credit-reason">Gerekçe</Label>
            <Textarea id="credit-reason" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Hatalı sevkiyat, iade talebi…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreditOpen(false)} disabled={creditPending}>Vazgeç</Button>
            <Button onClick={submitCredit} disabled={creditPending}>{creditPending ? <Loader2 className="size-4 animate-spin" /> : null} İade faturası kes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Faturayı iptal et</DialogTitle>
            <DialogDescription>Yevmiye fişi ters kayıtla iptal edilir. Yalnızca hiç tahsilat/ödeme almamış faturalar iptal edilebilir.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Gerekçe (opsiyonel)</Label>
            <Textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Mükerrer kayıt…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelPending}>Vazgeç</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={cancelPending}>{cancelPending ? <Loader2 className="size-4 animate-spin" /> : null} İptal et</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

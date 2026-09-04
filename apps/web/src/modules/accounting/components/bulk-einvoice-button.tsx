'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendBulkEInvoiceAction } from '../actions';

/** Henüz `accepted` olmayan tüm satış faturalarını tek seferde gönderir (sandbox — deterministik kabul). */
export function BulkEInvoiceButton({ invoiceIds }: { invoiceIds: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function run() {
    if (!invoiceIds.length) { toast.info('Gönderilecek fatura yok'); return; }
    setPending(true);
    const res = await sendBulkEInvoiceAction({ invoiceIds });
    setPending(false);
    if (res.ok) {
      toast.success(`${res.data.sent} fatura için e-belge gönderildi`);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Button variant="outline" onClick={run} disabled={pending || !invoiceIds.length}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} e-Fatura gönder ({invoiceIds.length})
    </Button>
  );
}

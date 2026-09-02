'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Send, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeTransferAction, receiveTransferAction } from '../actions';

export function TransferActions({ transferId, status, canTransfer }: { transferId: string; status: string; canTransfer: boolean }) {
  const [pending, startTransition] = useTransition();
  if (!canTransfer) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error);
    });
  };

  if (status === 'draft') {
    return (
      <Button onClick={() => run(() => completeTransferAction({ id: transferId }), 'Transfer tamamlandı')} disabled={pending}>
        <Send className="size-4" /> Tamamla
      </Button>
    );
  }
  if (status === 'in_transit') {
    return (
      <Button onClick={() => run(() => receiveTransferAction({ id: transferId }), 'Teslim alındı')} disabled={pending}>
        <PackageCheck className="size-4" /> Teslim al
      </Button>
    );
  }
  return null;
}

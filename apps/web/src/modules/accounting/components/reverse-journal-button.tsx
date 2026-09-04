'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { reverseJournalEntryAction } from '../actions';

export function ReverseJournalButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const res = await reverseJournalEntryAction({ entryId });
    setPending(false);
    if (res.ok) {
      toast.success('Fiş ters kayıtla iptal edildi');
      setOpen(false);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Undo2 className="size-3.5" /> Ters kayıt</Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fişi ters kayıtla iptal et</DialogTitle>
          <DialogDescription>Borç/alacak satırları ters çevrilmiş yeni bir fiş oluşturulur; ikiz deftere düşen fiş de otomatik ters çevrilir.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Vazgeç</Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} Ters kaydı oluştur</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}

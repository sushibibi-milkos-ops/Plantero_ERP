'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { reverseJournalEntryAction } from '../actions';

// stockLinkedRefType (P0 kök neden — kritik bulgu, UI ikincil savunma): core'daki
// `reverseJournalEntry` guard'ı (packages/core/src/accounting/journal.ts) sunucu tarafında zaten
// reddediyor — bu sadece kullanıcının hiç tıklayamaması için ikinci bir savunma katmanı. Karar
// ('bu fiş stok kaynaklı mı') SUNUCU bileşeninde (yevmiye/[id]/page.tsx, STOCK_LINKED_REF_TYPES ile)
// verilir ve buraya HAZIR bir bayrak olarak geçer — `@plantero/core`'un aggregate index'i (db/audit
// bağımlılıkları, `node:crypto` dahil) bu 'use client' dosyasına ASLA import edilmemeli, tarayıcı
// paketleme hatası verir (webpack "UnhandledSchemeError: node:crypto").
export function ReverseJournalButton({ entryId, stockLinkedRefType }: { entryId: string; stockLinkedRefType?: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (stockLinkedRefType) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" size="sm" disabled aria-disabled>
              <Undo2 className="size-3.5" /> Ters kayıt
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Bu fiş bir stok hareketinden ({stockLinkedRefType}) otomatik üretildi; muhasebeden ters kayıtla iptal edilemez.</TooltipContent>
      </Tooltip>
    );
  }

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

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runReconciliationAction } from '../actions';

/** AI Mutabakat Ajanı'nı eşleşmemiş tüm hareketler için çalıştırır (bkz. bankReconciliation.ts) */
export function RunReconciliationButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await runReconciliationAction({});
          if (res.ok) {
            toast.success(`Mutabakat çalıştırıldı: ${res.data.evaluated} değerlendirildi, ${res.data.autoApplied} otomatik uygulandı, ${res.data.suggested} öneri`);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      Mutabakat çalıştır
    </Button>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runReconciliationAction } from '../actions';

/** AI Mutabakat Ajanı'nı çalıştırır (unmatched hareketleri değerlendirir: otomatik uygular ya da öneri üretir). */
export function RunReconciliationButton({ bankAccountId, label = 'Mutabakatı çalıştır' }: { bankAccountId?: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function run() {
    setPending(true);
    const res = await runReconciliationAction({ bankAccountId: bankAccountId ?? null });
    setPending(false);
    if (res.ok) {
      toast.success(`${res.data.evaluated} hareket değerlendirildi — ${res.data.autoApplied} otomatik uygulandı, ${res.data.suggested} öneri üretildi`);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Button onClick={run} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {label}
    </Button>
  );
}

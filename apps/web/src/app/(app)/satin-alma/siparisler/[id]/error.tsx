'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

/**
 * Tur 6 P1 tedarik-loading-01 (bkz. loading.tsx notu) — hata sınırı, `/depo/error.tsx` ile aynı kalıp:
 * "Tekrar dene" `reset()` ile aynı segmenti yeniden render eder, "Siparişlere dön" listeye geri götürür.
 */
export default function PurchaseOrderDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Bu sipariş yüklenemedi"
      description={error.message || 'Sipariş detayı getirilirken beklenmeyen bir hata oluştu.'}
      className="mt-10"
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>
            <RotateCcw className="size-4" /> Tekrar dene
          </Button>
          <Button asChild variant="outline">
            <Link href="/satin-alma/siparisler">Siparişlere dön</Link>
          </Button>
        </div>
      }
    />
  );
}

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

/**
 * Depo modülü hata sınırı. Grup düzeyindeki `(app)/error.tsx` her rotayı zaten yakalar ama depo'ya
 * özel bağlam yoktu (Tur 3 P1 bulgusu: 5 detay route'unda hem yükleniyor hem hata durumu eksikti).
 * Bu sınır en yakın (depo altındaki) hatayı önce yakalar; "Tekrar dene" `reset()` ile aynı segmenti
 * yeniden render eder, "Depo'ya dön" en güvenli liste ekranına (stok) geri götürür.
 */
export default function DepoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Bu ekran yüklenemedi"
      description={error.message || 'Depo verisi getirilirken beklenmeyen bir hata oluştu.'}
      className="mt-10"
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>
            <RotateCcw className="size-4" /> Tekrar dene
          </Button>
          <Button asChild variant="outline">
            <Link href="/depo/stok">Depo&apos;ya dön</Link>
          </Button>
        </div>
      }
    />
  );
}

'use client';

import { useEffect } from 'react';
import { ShieldAlert, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

/**
 * Uygulama hata sınırı. `ForbiddenError` (yetki) ayrı mesajla gösterilir;
 * diğer hatalar için yeniden dene.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.digest === 'FORBIDDEN' || error.name === 'ForbiddenError' || /forbidden|yetki/i.test(error.message);

  useEffect(() => {
    if (!forbidden) console.error(error);
  }, [error, forbidden]);

  if (forbidden) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Bu sayfa için yetkiniz yok"
        description="Gerekli izin rolünüzde tanımlı değil. Erişim gerekiyorsa sistem yöneticinize başvurun."
        className="mt-10"
        action={
          <Button asChild variant="outline">
            <Link href="/kokpit">
              <Home className="size-4" /> Kokpite dön
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={ShieldAlert}
      title="Bir şeyler ters gitti"
      description={error.message || 'Sayfa yüklenirken beklenmeyen bir hata oluştu.'}
      className="mt-10"
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>
            <RotateCcw className="size-4" /> Yeniden dene
          </Button>
          <Button asChild variant="outline">
            <Link href="/kokpit">Kokpit</Link>
          </Button>
        </div>
      }
    />
  );
}

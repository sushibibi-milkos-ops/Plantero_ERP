'use client';

import { useEffect } from 'react';
import { WifiOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Operatör PIN girişi (`/operator/giris`) hata sınırı — `(auth)/error.tsx` ile aynı kök nedenin
 * (Tur 12 P1 shell-login-error-boundary-01) atölye tableti tarafındaki karşılığı: bu grup da
 * `(operator)/error.tsx`'in dışındaydı ve hiçbir `error.tsx`'i yoktu. Büyük dokunma hedefleri
 * `(operator)/error.tsx` ile aynı desende (eldivenli operatör kullanımı).
 */
export default function OperatorAuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
        <WifiOff className="size-7" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-lg font-semibold">Giriş ekranı yüklenemedi</div>
        <p className="mt-1 text-sm text-muted-foreground">Wifi bağlantınızı kontrol edip tekrar deneyin.</p>
      </div>
      <div className="mt-2 flex w-full flex-col gap-2">
        <Button onClick={reset} className="h-14 w-full text-base">
          <RotateCcw className="size-5" /> Tekrar dene
        </Button>
        <Button variant="outline" className="h-14 w-full text-base" onClick={() => window.location.reload()}>
          Sayfayı yenile
        </Button>
      </div>
    </div>
  );
}

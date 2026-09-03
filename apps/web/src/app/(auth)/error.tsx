'use client';

import { useEffect } from 'react';
import { WifiOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Kimlik doğrulama grubu (`/login`) hata sınırı. Bu grup `(app)/error.tsx`'in DIŞINDA (oturum
 * gerekmeden erişilir) — daha önce hiç `error.tsx` yoktu, bu yüzden `/login`'de bir client-side
 * istisna (ör. giriş POST'u sırasında dev sunucusunun kendini yeniden başlatmasıyla çakışan bir ağ
 * hatası) Next'in Türkçe olmayan, "tekrar dene" imkânı sunmayan varsayılan hata ekranına düşüyordu
 * (Tur 12 P1 shell-login-error-boundary-01). `reset()` yalnızca bu segmenti yeniden render eder;
 * dev sunucusu tamamen yeniden başlamışsa (HMR reset) tam sayfa yenileme daha güvenilir olduğundan
 * "Sayfayı yenile" ikinci bir seçenek olarak sunulur.
 */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
        <WifiOff className="size-7" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-lg font-semibold">Giriş sayfası yüklenemedi</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Bir ağ veya bağlantı sorunu oluştu. İnternet bağlantınızı kontrol edip tekrar deneyin.
        </p>
      </div>
      <div className="mt-2 flex w-full flex-col gap-2">
        <Button onClick={reset} className="w-full">
          <RotateCcw className="size-4" /> Tekrar dene
        </Button>
        <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
          Sayfayı yenile
        </Button>
      </div>
    </div>
  );
}

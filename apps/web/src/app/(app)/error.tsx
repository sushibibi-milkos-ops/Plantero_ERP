'use client';

import { useEffect } from 'react';
import { ShieldAlert, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { useShell } from '@/components/app-shell/app-shell';

/**
 * Uygulama hata sınırı. `ForbiddenError` (yetki) ayrı mesajla gösterilir;
 * diğer hatalar için yeniden dene.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.digest === 'FORBIDDEN' || error.name === 'ForbiddenError' || /forbidden|yetki/i.test(error.message);
  // Kök neden (Tur 21 P1, shell-middleware-login-redirect-cockpit-loop-01): bu buton eskiden sabit
  // '/kokpit'e gidiyordu — `cockpit.view` izni olmayan roller (depo/satın_alma/kalite) için bu, AYNI
  // ForbiddenError'a geri düşen çıkışsız bir döngüydü. `useShell()` bu hata sınırının da içinde
  // render edildiği (app)/layout.tsx'teki AppShell'den geliyor (layout, error.tsx'i sarmalayan React
  // ağacında hatadan ETKİLENMEDEN mounted kalır) — `nav` zaten kullanıcının izinlerine göre süzülmüş
  // menü listesi, bu yüzden ilk kalemi HER ZAMAN gerçekten erişilebilir bir rota.
  const { nav } = useShell();
  const safeHome = nav[0]?.items[0]?.href ?? '/onaylar';

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
            <Link href={safeHome}>
              <Home className="size-4" /> Panele dön
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
            <Link href={safeHome}>Panele dön</Link>
          </Button>
        </div>
      }
    />
  );
}

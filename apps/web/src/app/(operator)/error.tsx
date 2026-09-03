'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { WifiOff, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Operatör terminali hata sınırı. `(operator)` grubu `(app)`'in genel `error.tsx`'ini miras almaz —
 * fabrika tabletinde atölye wifi'sinde sık yaşanan sorgu hatasında Next'in varsayılan (operatöre
 * Türkçe hiçbir şey söylemeyen) hata sayfası yerine büyük dokunma hedefli, Türkçe bir ekran.
 */
export default function OperatorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-16 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
        <WifiOff className="size-7" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-lg font-semibold">Bağlantı sorunu</div>
        <p className="mt-1 text-sm text-muted-foreground">Sayfa yüklenemedi. Wifi bağlantınızı kontrol edip tekrar deneyin.</p>
      </div>
      <div className="mt-2 flex w-full flex-col gap-2">
        <Button onClick={reset} className="h-14 text-base">
          <RotateCcw className="size-5" /> Tekrar dene
        </Button>
        <Button asChild variant="outline" className="h-14 text-base">
          <Link href="/operator">
            <ArrowLeft className="size-5" /> Hat seçimine dön
          </Link>
        </Button>
      </div>
    </div>
  );
}

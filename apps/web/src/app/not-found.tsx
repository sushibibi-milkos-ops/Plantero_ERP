import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

/**
 * Kök 404 sınırı (Tur 2 P1 shell bulgusu). `(app)/not-found.tsx` yalnızca o route
 * grubunun İÇİNDE çağrılan `notFound()`'u ya da grup altındaki bilinmeyen bir alt yolu
 * karşılar; hiçbir route grubuyla eşleşmeyen bir URL (ör. grup segmentine hiç girmeyen
 * `/finans/krediler/<uuid>` gibi var olmayan bir üst segment) Next.js router'ında bu kök
 * dosyaya düşer. Daha önce burada hiç dosya yoktu, bu yüzden Next'in İngilizce/marka dışı
 * varsayılan "This page could not be found." ekranı çıkıyordu. Bu dosya hiçbir route
 * grubunun (dolayısıyla app-shell kenar çubuğunun) İÇİNDE render edilmez — kök
 * `layout.tsx`'in doğrudan çocuğudur — bu yüzden `(app)/not-found.tsx`'in aksine kendi
 * başına ortalanmış, bağımsız bir sayfa olarak tasarlanmıştır (bkz. `(auth)/error.tsx`
 * ile aynı ilke).
 */
export default function RootNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        icon={FileQuestion}
        title="Sayfa bulunamadı"
        description="Aradığınız sayfa silinmiş, taşınmış ya da hiç var olmamış olabilir."
        className="max-w-sm border-none"
        action={
          <Button asChild variant="outline">
            <Link href="/kokpit">
              <Home className="size-4" /> Kokpite dön
            </Link>
          </Button>
        }
      />
    </div>
  );
}

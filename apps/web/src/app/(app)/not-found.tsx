import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

/**
 * Uygulama genelinde 404 sınırı — daha önce hiç yoktu, `notFound()` çağrıldığında Next.js'in
 * varsayılan İngilizce "This page could not be found." ekranı app shell'in içinde çıkıyordu
 * (Tur 2 bulgusu). Belgeye özel bir mesaj isteyen rota kendi `not-found.tsx`'ini eklemeli
 * (bkz. satis/siparisler/[id]/not-found.tsx) — bu dosya geri kalan her yer için ortak.
 */
export default function NotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Sayfa bulunamadı"
      description="Aradığınız sayfa silinmiş, taşınmış ya da hiç var olmamış olabilir."
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

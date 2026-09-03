import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

/** Geçersiz/yanlış belge türündeki id ile açılan teklif detayına belgeye özel 404. */
export default function QuotationNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Teklif bulunamadı"
      description="Aradığınız belge silinmiş ya da farklı bir türde (ör. sipariş) olabilir."
      className="mt-10"
      action={
        <Button asChild variant="outline">
          <Link href="/satis/teklifler">
            <ArrowLeft className="size-4" /> Listeye dön
          </Link>
        </Button>
      }
    />
  );
}

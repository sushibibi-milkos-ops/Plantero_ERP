import { Skeleton } from '@/components/ui/skeleton';
import { DataTableSkeleton } from '@/components/data-table/skeleton';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

/** /depo/mal-kabul: KPI şeridi yok, doğrudan tablo — başlık ve sütun başlıkları gerçek metin. */
export default function ReceiptsLoading() {
  return (
    <div aria-busy>
      <PageHeader
        title="Mal Kabul"
        description={<Skeleton className="h-4 w-40" />}
        actions={
          <Button disabled className="pointer-events-none opacity-60">
            <Plus className="size-4" /> Yeni mal kabul
          </Button>
        }
      />
      <DataTableSkeleton headers={['Belge no', 'Tedarikçi', 'Durum', 'Satır', 'Toplam tutar', 'İrsaliye no', 'Tarih']} />
    </div>
  );
}

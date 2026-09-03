import { Skeleton } from '@/components/ui/skeleton';

/** /depo/sevkiyat/[id]/topla: mobil öncelikli toplama arayüzü — PageHeader/tablo yok, kendi başlığı var. */
export default function PickLoading() {
  return (
    <div className="space-y-4 p-4" aria-busy>
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-14 rounded-md" />
      <Skeleton className="h-11 rounded-md" />
    </div>
  );
}

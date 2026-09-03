import { Skeleton } from '@/components/ui/skeleton';

/** /depo/tara: ne KPI ne tablo var — tek tarama kartı. Genel iskelet burada tamamen yanlış şekildi. */
export default function ScanLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

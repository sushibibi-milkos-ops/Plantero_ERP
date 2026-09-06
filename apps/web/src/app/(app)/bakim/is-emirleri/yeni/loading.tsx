import { Skeleton } from '@/components/ui/skeleton';

export default function ReportBreakdownLoading() {
  return (
    <div className="mx-auto max-w-xl space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-14 rounded-md" />
      <Skeleton className="h-10 rounded-md" />
    </div>
  );
}

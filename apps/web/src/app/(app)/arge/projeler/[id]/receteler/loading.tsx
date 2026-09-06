import { Skeleton } from '@/components/ui/skeleton';

export default function RecipesLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

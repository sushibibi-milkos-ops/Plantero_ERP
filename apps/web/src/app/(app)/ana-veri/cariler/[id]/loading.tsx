import { DetailPageSkeleton } from '@/modules/masterdata/components/loading-skeletons';

export default function Loading() {
  return <DetailPageSkeleton tabs={5} kpis={4} rows={5} />;
}

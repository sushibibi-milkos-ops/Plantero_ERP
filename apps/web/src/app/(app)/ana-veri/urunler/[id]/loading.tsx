import { DetailPageSkeleton } from '@/modules/masterdata/components/loading-skeletons';

export default function Loading() {
  return <DetailPageSkeleton tabs={8} kpis={0} rows={7} />;
}

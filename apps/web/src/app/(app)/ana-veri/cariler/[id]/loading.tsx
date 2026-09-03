import { DetailPageSkeleton } from '@/modules/masterdata/components/loading-skeletons';

export default function Loading() {
  {/* kredi limiti tanımlı cari olmadığı sürece (seed'de 0/17) sekme her zaman 3 KPI render eder — 4
      iskelet baloncuğu göstermek yüklenirken görünür bir zıplamaya yol açıyordu (Tur 3 P1 bulgusu). */}
  return <DetailPageSkeleton tabs={5} kpis={3} rows={5} />;
}

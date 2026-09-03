import { DetailPageSkeleton } from '@/modules/masterdata/components/loading-skeletons';

/** Genel (app)/loading.tsx yerine bu rotaya özel iskelet — nihai düzenle (başlık + KPI şeridi + tablo) uyumlu. */
export default function Loading() {
  return <DetailPageSkeleton tabs={0} kpis={5} rows={6} />;
}

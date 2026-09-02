import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ScanScreen } from '@/modules/stock/components/scan-screen';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Tara' };
export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  await requirePermission('stock.view');
  return (
    <>
      <PageHeader title="Tara" description="Barkod, QR, lot ya da lokasyon kodu okutun" />
      <ScanScreen />
    </>
  );
}

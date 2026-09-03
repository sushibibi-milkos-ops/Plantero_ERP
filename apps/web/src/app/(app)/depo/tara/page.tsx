import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ScanScreen } from '@/modules/stock/components/scan-screen';

export const metadata: Metadata = { title: 'Tara' };
export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  await requirePermission('stock.view');
  // Önceden sola dayalı, tam genişlik `PageHeader` + ortalanmış dar bir tarama kartı aynı sayfada iki
  // farklı hizalama ekseni yaratıyordu (Tur 3 P1 bulgusu). Başlık artık `ScanScreen`'in kendi ortalanmış
  // kolonunda, kartın üstünde bir eyebrow olarak duruyor — tek eksen.
  return <ScanScreen />;
}

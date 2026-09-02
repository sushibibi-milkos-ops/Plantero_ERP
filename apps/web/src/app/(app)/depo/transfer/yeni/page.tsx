import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listWarehouses, listLocations } from '@/modules/stock/queries';
import { TransferForm } from '@/modules/stock/components/transfer-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Transfer' };
export const dynamic = 'force-dynamic';

export default async function NewTransferPage() {
  await requirePermission('stock.transfer');
  const [warehouses, locations] = await Promise.all([listWarehouses(), listLocations()]);

  return (
    <>
      <PageHeader title="Yeni Transfer" description="Lokasyonlar arası ya da depolar arası stok taşıma" />
      <TransferForm warehouses={warehouses} locations={locations.map((l) => ({ id: l.id, code: l.code, usage: l.usage, warehouseId: l.warehouseId, isPickable: l.isPickable }))} />
    </>
  );
}

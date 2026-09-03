import type { Metadata } from 'next';
import { getLocationTree } from '@plantero/core';
import { db } from '@plantero/db';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listWarehouses } from '@/modules/masterdata/queries';
import { LocationTree, AddRootLocationButton } from '@/modules/masterdata/components/location-tree';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = { title: 'Depolar' };
export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
  const user = await requirePermission('masterdata.view');
  const canManage = userCan(user, 'masterdata.manage');
  const warehouses = await listWarehouses();
  const trees = await Promise.all(warehouses.map((w) => getLocationTree(db, w.id)));

  return (
    <>
      <PageHeader title="Depolar" description={`${warehouses.length} depo · Tire fabrika ve Buca deposu lokasyon ağacı`} />
      {warehouses.length === 0 ? (
        <EmptyState compact title="Depo yok" description="Seed çalıştırıldığında Tire ve Buca depoları burada listelenir." />
      ) : (
        <div className="space-y-8">
          {warehouses.map((w, i) => (
            <section key={w.id}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{w.name}</h2>
                  <p className="text-[12px] text-muted-foreground">
                    {w.code} {w.address ? `· ${w.address}` : ''} {w.isProduction ? '· Üretim yapılıyor' : ''}
                  </p>
                </div>
                <AddRootLocationButton warehouseId={w.id} canManage={canManage} />
              </div>
              <LocationTree warehouseId={w.id} tree={trees[i] ?? []} canManage={canManage} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}

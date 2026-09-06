import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listPurchaseOrders } from '@/modules/purchasing/queries';
import { OrdersTable } from '@/modules/purchasing/components/orders-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { D, ZERO, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'Satın Alma Siparişleri' };
export const dynamic = 'force-dynamic';

export default async function PurchaseOrdersPage() {
  const user = await requirePermission('purchasing.view');
  const orders = await listPurchaseOrders();

  const openStatuses = new Set(['draft', 'ai_draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'partially_received']);
  const openOrders = orders.filter((o) => openStatuses.has(o.status));
  const openValue = toDb(openOrders.reduce((a, o) => a.plus(D(o.grandTotal)), ZERO));
  const pendingApproval = orders.filter((o) => o.status === 'pending_approval' || o.status === 'ai_draft').length;
  const aiGenerated = orders.filter((o) => o.isAiGenerated).length;

  return (
    <>
      <PageHeader
        title="Satın Alma Siparişleri"
        description={`${orders.length} sipariş${pendingApproval ? ` · ${pendingApproval} onay bekliyor` : ''}`}
        actions={
          userCan(user, 'purchasing.draft') ? (
            <Button asChild>
              <Link href="/satin-alma/siparisler/yeni">
                <Plus className="size-4" /> Yeni sipariş
              </Link>
            </Button>
          ) : undefined
        }
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Açık sipariş" value={openOrders.length} format="int" />
        {/* Tur 10 P2 tedarik-siparisler-money-format-01 kök neden: KpiCard varsayılan olarak
            parayı 0 ondalıkla basıyor (₺47.160), oysa altındaki tabloda 'Tutar' kolonu 2 ondalıkla
            (₺4.620,00) gösteriliyordu — aynı ekranda iki para biçimi. `fractionDigits={2}` ile
            KPI, tablo ile aynı hassasiyete getirildi (bir şeritte tek ondalık kuralı). */}
        <KpiCard variant="strip" title="Açık sipariş tutarı" value={openValue} format="money" fractionDigits={2} />
        <KpiCard variant="strip" title="Onay bekleyen" value={pendingApproval} format="int" />
        <KpiCard variant="strip" title="AI taslağı" value={aiGenerated} format="int" />
      </KpiStripRow>

      <OrdersTable orders={orders} />
    </>
  );
}

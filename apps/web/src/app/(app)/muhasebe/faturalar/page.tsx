import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listInvoices } from '@/modules/accounting/queries';
import { InvoicesTable } from '@/modules/accounting/components/invoices-table';
import { BulkEInvoiceButton } from '@/modules/accounting/components/bulk-einvoice-button';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { D, ZERO } from '@plantero/core/money';

export const metadata: Metadata = { title: 'Faturalar' };
export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const user = await requirePermission('accounting.view');
  const [sales, purchase, returns] = await Promise.all([
    listInvoices(['sales']),
    listInvoices(['purchase']),
    listInvoices(['sales_return', 'purchase_return']),
  ]);

  const openReceivable = sales.filter((r) => r.status !== 'cancelled').reduce((acc, r) => acc.plus(D(r.residual)), ZERO);
  const openPayable = purchase.filter((r) => r.status !== 'cancelled').reduce((acc, r) => acc.plus(D(r.residual)), ZERO);
  const overdueCount = [...sales, ...purchase].filter((r) => r.daysOverdue > 0).length;
  const notSentIds = sales.filter((r) => r.status !== 'cancelled' && r.eInvoiceStatus !== 'accepted').map((r) => r.id);

  return (
    <>
      <PageHeader
        title="Faturalar"
        description={`${sales.length} satış · ${purchase.length} alış · ${returns.length} iade`}
        actions={
          userCan(user, 'accounting.invoice') ? (
            <Button asChild>
              <Link href="/muhasebe/faturalar/yeni">
                <Plus className="size-4" /> Gider faturası
              </Link>
            </Button>
          ) : undefined
        }
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Açık alacak" value={openReceivable.toFixed(4)} format="money" />
        <KpiCard variant="strip" title="Açık borç" value={openPayable.toFixed(4)} format="money" />
        <KpiCard variant="strip" title="Vadesi geçen" value={overdueCount} format="int" />
        <KpiCard variant="strip" title="Gönderilmemiş e-Fatura" value={notSentIds.length} format="int" />
      </KpiStripRow>

      <Tabs defaultValue="sales">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList variant="line">
            <TabsTrigger value="sales">Satış</TabsTrigger>
            <TabsTrigger value="purchase">Alış</TabsTrigger>
            <TabsTrigger value="returns">İadeler</TabsTrigger>
          </TabsList>
          {userCan(user, 'accounting.einvoice') ? <BulkEInvoiceButton invoiceIds={notSentIds} /> : null}
        </div>

        <TabsContent value="sales" className="mt-3">
          <InvoicesTable rows={sales} emptyTitle="Henüz satış faturası yok" />
        </TabsContent>
        <TabsContent value="purchase" className="mt-3">
          <InvoicesTable rows={purchase} emptyTitle="Henüz alış faturası yok" />
        </TabsContent>
        <TabsContent value="returns" className="mt-3">
          <InvoicesTable rows={returns} emptyTitle="Henüz iade faturası yok" />
        </TabsContent>
      </Tabs>
    </>
  );
}

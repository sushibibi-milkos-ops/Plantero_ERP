import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth';
import { getWorkOrderDetail } from '@/modules/production/queries';
import { WorkOrderActions } from '@/modules/production/components/work-order-actions';
import { WorkOrderTabs } from '@/modules/production/components/work-order-tabs';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { formatDate, formatDateTime } from '@/lib/format';
import { D } from '@plantero/core';

export const metadata: Metadata = { title: 'İş Emri Detayı' };
export const dynamic = 'force-dynamic';

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('production.view');
  const detail = await getWorkOrderDetail(id);
  if (!detail) notFound();
  const { wo, product, uomCode, line, warehouse, operatorName } = detail;

  const remainingPlannedQty = D(wo.plannedQty).minus(D(wo.producedQty)).toFixed(4);

  return (
    <>
      <PageHeader
        eyebrow="İş Emri"
        title={<span className="font-mono">{wo.docNo}</span>}
        description={`${product.name} · ${product.sku}`}
        actions={
          <WorkOrderActions
            id={wo.id}
            status={wo.status}
            remainingPlannedQty={remainingPlannedQty}
            uomCode={uomCode}
            perms={{ plan: userCan(user, 'production.plan'), operate: userCan(user, 'production.operate'), close: userCan(user, 'production.close') }}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={wo.status} kind="work_order" size="md" />
          <span className="font-mono text-xs text-muted-foreground">{line.code} — {line.name}</span>
          <span className="text-muted-foreground">{warehouse.code}</span>
          {wo.plannedStart ? <span className="text-muted-foreground">Planlanan {formatDate(wo.plannedStart)}</span> : null}
          {wo.startedAt ? <span className="text-muted-foreground">Başladı {formatDateTime(wo.startedAt)}</span> : null}
          {wo.finishedAt ? <span className="text-muted-foreground">Bitti {formatDateTime(wo.finishedAt)}</span> : null}
          {operatorName ? <span className="text-muted-foreground">Operatör: {operatorName}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span>Planlanan <QtyCell value={wo.plannedQty} uom={uomCode} className="inline" /></span>
          <span>Üretilen <QtyCell value={wo.producedQty} uom={uomCode} className="inline text-success" /></span>
          {D(wo.scrapQty).gt(0) ? <span>Fire <QtyCell value={wo.scrapQty} uom={uomCode} className="inline text-destructive" /></span> : null}
          {wo.yieldPct ? <span className="text-muted-foreground">Verim %{Number(wo.yieldPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span> : null}
        </div>
      </PageHeader>

      <WorkOrderTabs detail={detail} />
    </>
  );
}

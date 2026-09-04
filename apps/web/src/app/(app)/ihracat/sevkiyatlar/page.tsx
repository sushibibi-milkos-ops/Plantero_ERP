import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listShipments } from '@/modules/export/queries';
import { ShipmentsTable } from '@/modules/export/components/shipments-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { D, ZERO, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'İhracat Sevkiyatları' };
export const dynamic = 'force-dynamic';

const OPEN_STATUSES = new Set(['draft', 'proforma_sent', 'confirmed', 'packing', 'customs', 'shipped']);

export default async function ExportShipmentsPage() {
  const user = await requirePermission('export.view');
  const shipments = await listShipments();

  const open = shipments.filter((s) => OPEN_STATUSES.has(s.status));
  const openValue = toDb(open.reduce((a, s) => a.plus(D(s.amountTry)), ZERO));
  const inCustoms = shipments.filter((s) => s.status === 'customs').length;
  const missingDocs = shipments.filter((s) => s.docsTotal > 0 && s.docsDone < s.docsTotal && !['closed', 'cancelled'].includes(s.status)).length;

  return (
    <>
      <PageHeader
        title="İhracat Sevkiyatları"
        description={`${shipments.length} sevkiyat${inCustoms ? ` · ${inCustoms} gümrükte` : ''}`}
        actions={
          userCan(user, 'export.manage') ? (
            <Button asChild>
              <Link href="/ihracat/sevkiyatlar/yeni">
                <Plus className="size-4" /> Yeni sevkiyat
              </Link>
            </Button>
          ) : undefined
        }
      />

      <KpiStripRow>
        <KpiCard variant="strip" title="Açık sevkiyat" value={open.length} format="int" />
        <KpiCard variant="strip" title="Açık sevkiyat tutarı" value={openValue} format="money" />
        <KpiCard variant="strip" title="Gümrükte" value={inCustoms} format="int" />
        <KpiCard variant="strip" title="Belgesi eksik" value={missingDocs} format="int" />
      </KpiStripRow>

      <ShipmentsTable shipments={shipments} />
    </>
  );
}

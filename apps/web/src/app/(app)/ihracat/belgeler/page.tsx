import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listAllExportDocuments, listResponsibleUsers } from '@/modules/export/queries';
import { DocumentsTable } from '@/modules/export/components/documents-table';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';

export const metadata: Metadata = { title: 'İhracat Belgeleri' };
export const dynamic = 'force-dynamic';

export default async function ExportDocumentsPage() {
  await requirePermission('export.view');
  const [documents, responsibleUsers] = await Promise.all([listAllExportDocuments(), listResponsibleUsers()]);

  const pending = documents.filter((d) => !['sent', 'received', 'not_required'].includes(d.status));
  const overdue = pending.filter((d) => d.dueDate && d.dueDate < new Date().toISOString().slice(0, 10));
  const unassigned = pending.filter((d) => !d.responsibleName);

  return (
    <>
      <PageHeader title="İhracat Belgeleri" description="Tüm sevkiyatların proforma/fatura/çeki listesi/sertifika takibi tek panoda." />

      <KpiStripRow>
        <KpiCard variant="strip" title="Toplam belge" value={documents.length} format="int" />
        <KpiCard variant="strip" title="Bekleyen" value={pending.length} format="int" />
        <KpiCard variant="strip" title="Vadesi geçmiş" value={overdue.length} format="int" />
        <KpiCard variant="strip" title="Sorumlusuz" value={unassigned.length} format="int" />
      </KpiStripRow>

      <DocumentsTable documents={documents} responsibleUsers={responsibleUsers} showShipmentColumn />
    </>
  );
}

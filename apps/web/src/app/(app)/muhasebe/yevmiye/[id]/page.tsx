import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission, userCan } from '@/lib/auth';
import { getJournalEntryDetail } from '@/modules/accounting/queries';
import { ReverseJournalButton } from '@/modules/accounting/components/reverse-journal-button';
import { JournalLinesView } from '@/modules/accounting/components/journal-lines-view';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Yevmiye Fişi' };
export const dynamic = 'force-dynamic';

export default async function JournalEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('accounting.view');
  const detail = await getJournalEntryDetail(id);
  if (!detail) notFound();
  const { entry, journalCode, lines, twin } = detail;

  return (
    <>
      <PageHeader
        eyebrow={`${entry.ledger} — ${journalCode}`}
        title={entry.docNo}
        description={`${formatDate(entry.entryDate)} · ${entry.description}`}
        actions={userCan(user, 'accounting.post') && entry.status === 'posted' ? <ReverseJournalButton entryId={entry.id} /> : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={entry.status} kind="journal_entry" />
          {twin ? <Link href={`/muhasebe/yevmiye/${twin.id}`} className="text-[13px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">İkiz fiş ({twin.ledger}) ↗</Link> : null}
          {entry.refType && entry.refId ? <span className="text-[13px] text-muted-foreground">Kaynak: {entry.refType} · {entry.refNo}</span> : null}
        </div>
      </PageHeader>

      <JournalLinesView lines={lines} totalDebit={entry.totalDebit} totalCredit={entry.totalCredit} />
    </>
  );
}

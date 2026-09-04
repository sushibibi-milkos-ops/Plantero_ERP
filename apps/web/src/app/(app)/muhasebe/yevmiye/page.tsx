import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listJournalEntries, listJournalsForForm } from '@/modules/accounting/queries';
import { JournalEntriesTable } from '@/modules/accounting/components/journal-entries-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata: Metadata = { title: 'Yevmiye' };
export const dynamic = 'force-dynamic';

export default async function JournalPage() {
  const user = await requirePermission('accounting.view');
  const [vukRows, ufrsRows, journals] = await Promise.all([
    listJournalEntries({ ledger: 'VUK' }), listJournalEntries({ ledger: 'UFRS' }), listJournalsForForm(),
  ]);
  const journalOptions = journals.map((j) => ({ value: j.code, label: j.code }));

  return (
    <>
      <PageHeader
        title="Yevmiye"
        description={`${vukRows.length} VUK fişi · ${ufrsRows.length} UFRS fişi`}
        actions={
          userCan(user, 'accounting.post') ? (
            <Button asChild><Link href="/muhasebe/yevmiye/yeni"><Plus className="size-4" /> Manuel fiş</Link></Button>
          ) : undefined
        }
      />
      <Tabs defaultValue="VUK">
        <TabsList variant="line">
          <TabsTrigger value="VUK">VUK</TabsTrigger>
          <TabsTrigger value="UFRS">UFRS</TabsTrigger>
        </TabsList>
        <TabsContent value="VUK" className="mt-3"><JournalEntriesTable rows={vukRows} journalOptions={journalOptions} /></TabsContent>
        <TabsContent value="UFRS" className="mt-3"><JournalEntriesTable rows={ufrsRows} journalOptions={journalOptions} /></TabsContent>
      </Tabs>
    </>
  );
}

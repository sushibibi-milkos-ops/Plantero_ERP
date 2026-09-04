import type { Metadata } from 'next';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { listChecks } from '@/modules/quality/queries';
import { ChecksTable } from '@/modules/quality/components/checks-table';

export const metadata: Metadata = { title: 'Kalite Kontrolleri' };
export const dynamic = 'force-dynamic';

export default async function QualityChecksPage() {
  await requirePermission('quality.view');
  const checks = await listChecks();
  const pending = checks.filter((c) => c.result === 'pending').length;
  const passed = checks.filter((c) => c.result === 'passed').length;
  const failed = checks.filter((c) => c.result === 'failed').length;

  return (
    <>
      <PageHeader
        title="Kalite Kontrolleri"
        description={`${checks.length} kontrol — ${pending} bekliyor · ${passed} geçti · ${failed} kaldı`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/kalite/sablonlar"><ListChecks className="size-4" /> Şablonlar</Link>
          </Button>
        }
      />
      <ChecksTable checks={checks} />
    </>
  );
}

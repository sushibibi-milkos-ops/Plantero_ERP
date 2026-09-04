import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { getPartnerStatement } from '@/modules/accounting/queries';
import { PartnerStatementView } from '@/modules/accounting/components/partner-statement-view';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';

export const metadata: Metadata = { title: 'Cari Ekstresi' };
export const dynamic = 'force-dynamic';

export default async function PartnerStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('accounting.view');
  const statement = await getPartnerStatement(id);
  if (!statement) notFound();
  const { partner, lines, aging } = statement;
  const runningBalance = lines.length ? lines[lines.length - 1]!.runningBalance : '0.0000';

  return (
    <>
      <PageHeader eyebrow={partner.code} title={`${partner.name} — Cari Ekstresi`} description={`${lines.length} hareket`} />

      {/* fractionDigits={2} (kritik bulgu muhasebe-faturalar-04 — kök neden, modül geneli): tüm
          muhasebe KPI şeritleri tek ondalık kuralına (2) sahip olmalı — bkz. /muhasebe/page.tsx. */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Güncel bakiye" value={runningBalance} format="money" fractionDigits={2} />
        {aging ? <KpiCard variant="strip" title="0-30 gün" value={aging.buckets[0]?.amount.toFixed(4) ?? '0'} format="money" fractionDigits={2} /> : null}
        {aging ? <KpiCard variant="strip" title="31-60 gün" value={aging.buckets[1]?.amount.toFixed(4) ?? '0'} format="money" fractionDigits={2} /> : null}
        {aging ? <KpiCard variant="strip" title="90+ gün" value={aging.buckets[3]?.amount.toFixed(4) ?? '0'} format="money" fractionDigits={2} /> : null}
      </KpiStripRow>

      <PartnerStatementView lines={lines} />
      <p className="mt-2 text-[12px] text-muted-foreground">Bakiye pozitifse cari bize borçlu (alacak fazlası); negatifse biz cariye borçluyuz.</p>
    </>
  );
}

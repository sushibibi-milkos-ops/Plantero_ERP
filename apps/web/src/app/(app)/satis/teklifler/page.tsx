import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { D, sum, toDb } from '@plantero/core';
import { requirePermission, userCan } from '@/lib/auth';
import { listQuotations } from '@/modules/sales/queries';
import { SalesDocsTable } from '@/modules/sales/components/sales-docs-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { MoneyCell } from '@/components/money-cell';

export const metadata: Metadata = { title: 'Teklifler' };
export const dynamic = 'force-dynamic';

export default async function QuotationsPage() {
  const user = await requirePermission('sales.quote');
  const quotations = await listQuotations();
  const pending = quotations.filter((q) => q.status === 'sent').length;
  // Teklifler hep TRY (döviz teklifi bu ekranda henüz yok) — para toplaması `decimal.js` ile
  // (bkz. money.ts, float toplama yasak). Boş tablonun altına da bir şey basmayız.
  const totalGrandTotal = toDb(sum(quotations.map((q) => D(q.grandTotal))));

  return (
    <>
      <PageHeader
        title="Teklifler"
        description={`${quotations.length} teklif · ${pending} yanıt bekliyor`}
        actions={userCan(user, 'sales.quote') ? (
          <Button asChild>
            <Link href="/satis/teklifler/yeni"><Plus className="size-4" /> Yeni teklif</Link>
          </Button>
        ) : undefined}
      />
      <SalesDocsTable rows={quotations} docType="quotation" />
      {/* Kapanış şeridi (Tur 5 P2 bulgusu): 4 satırlık tablodan sonra ~700px boş alan kalıyordu,
          hiçbir kapanış öğesi (toplam, sayfalama, "tümünü gör") yoktu — sayfa yarım bırakılmış gibi
          bitiyordu. Yalnızca dolu tabloda gösterilir; boş durumda zaten kendi EmptyState'i var. */}
      {quotations.length > 0 ? (
        <div className="mt-2 flex h-9 items-center justify-end border-t border-border/60 px-1 text-[13px] text-muted-foreground">
          {quotations.length} teklif · toplam <MoneyCell value={totalGrandTotal} className="ml-1 font-medium text-foreground" />
        </div>
      ) : null}
    </>
  );
}

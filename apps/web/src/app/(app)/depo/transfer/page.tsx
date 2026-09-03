import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { listTransfers } from '@/modules/stock/queries';
import { TransfersTable } from '@/modules/stock/components/transfers-table';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { NextStepHint } from '@/components/next-step-hint';
import { ZERO, D, toDb } from '@plantero/core';

export const metadata: Metadata = { title: 'Transfer' };
export const dynamic = 'force-dynamic';

export default async function TransfersPage() {
  const user = await requirePermission('stock.view');
  const transfers = await listTransfers();
  const inTransit = transfers.filter((t) => t.status === 'in_transit').length;
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const completedThisMonth = transfers.filter((t) => t.status === 'done' && t.createdAt.toISOString().slice(0, 7) === monthPrefix).length;
  const transferredValue = toDb(transfers.filter((t) => t.status !== 'cancelled').reduce((a, t) => a.plus(D(t.value)), ZERO));
  // Az kayıtlı listelerde (≤5) KPI şeridi + geniş tablo altında yüzlerce piksel boş kalıyor, sayfa
  // "yarım kalmış" görünüyordu (Tur 4 P2 bulgusu: 3 transferde ~900px boşluk). Bilgi zaten tabloda
  // olduğundan KPI şeridi gizlenir, içerik kabı daraltılır, tablo altına bağlamsal bir ipucu eklenir.
  const isSparse = transfers.length <= 5;

  return (
    <div className={isSparse ? 'max-w-5xl' : undefined}>
      <PageHeader
        title="Transfer"
        description={`${transfers.length} transfer${inTransit ? ` · ${inTransit} yolda` : ''}`}
        actions={
          userCan(user, 'stock.transfer') ? (
            <Button asChild>
              <Link href="/depo/transfer/yeni">
                <Plus className="size-4" /> Yeni transfer
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Kardeş ekranlarla aynı KPI anatomisi — tek satır + geniş boşluktan ibaret görünmesin (Tur 2). */}
      {!isSparse ? (
        <KpiStripRow>
          <KpiCard variant="strip" title="Yolda" value={inTransit} format="int" />
          <KpiCard variant="strip" title="Bu ay tamamlanan" value={completedThisMonth} format="int" />
          <KpiCard variant="strip" title="Transfer edilen değer" value={transferredValue} format="money" />
        </KpiStripRow>
      ) : null}

      <TransfersTable transfers={transfers} />
      {isSparse ? (
        <NextStepHint
          action={
            userCan(user, 'stock.transfer') ? (
              // Kök neden (Tur 10 P1 depo-transfer-01): metin yüksekliğinden ibaret bağlantı 19.5px'ti
              // — mobilde dokunma hedefi 44px'in çok altında. `min-h-11 items-center` masaüstünde
              // `md:min-h-0` ile eski kompakt görünüme döner.
              <Link href="/depo/transfer/yeni" className="inline-flex min-h-11 shrink-0 items-center font-medium text-primary hover:underline md:min-h-0">
                + Yeni transfer
              </Link>
            ) : undefined
          }
        >
          Depolar arası ya da depo içi stok taşımaları için yeni bir transfer oluşturabilirsiniz.
        </NextStepHint>
      ) : null}
    </div>
  );
}

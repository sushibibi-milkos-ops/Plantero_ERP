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
        {/* max-sm:before:content-none + max-sm:flex-col: pseudo-element ayraç mobilde şerit sarınca
            satır başında öksüz kalıyordu ("· Depo TIRE" 2. satırda başlıyordu, Tur 2 bulgusu) —
            mobilde dikey düzene geçilip ayraç tamamen kapatılır, masaüstünde nokta ayraç korunur. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm max-sm:flex-col max-sm:items-start max-sm:gap-y-1 [&>*:not(:first-child)]:before:mr-3 [&>*:not(:first-child)]:before:text-border [&>*:not(:first-child)]:before:content-['·'] max-sm:[&>*:not(:first-child)]:before:content-none">
          <StatusBadge status={wo.status} kind="work_order" size="md" />
          <span className="font-mono text-xs text-muted-foreground">{line.code} — {line.name}</span>
          <span className="text-muted-foreground">Depo {warehouse.code}</span>
          {wo.plannedStart ? <MetaField label="Planlanan" value={formatDate(wo.plannedStart)} /> : null}
          {wo.startedAt ? <MetaField label="Başladı" value={formatDateTime(wo.startedAt)} /> : null}
          {wo.finishedAt ? <MetaField label="Bitti" value={formatDateTime(wo.finishedAt)} /> : null}
          {operatorName ? <MetaField label="Operatör" value={operatorName} /> : null}
        </div>

        {/* flex w-fit (grid ... grid-cols-4 idi): 4 sabit sütunlu ızgara, 2 hücre dolu kaldığında
            (Fire=0, verim yok) 672px'e kadar ölü bant bırakıyordu — border-y/divide-x çizgileri
            içerik olmayan hücrelerde de sürüyordu (Tur 2'de dış çerçeve kaldırıldı ama bu iç bant
            kaldı, Tur 3 bulgusu, P1). flex ile şerit yalnızca dolu hücre kadar genişler. */}
        <div className="mt-4 flex w-fit divide-x divide-border/60 border-y border-border/60">
          <StatCell label="Planlanan" value={<QtyCell value={wo.plannedQty} uom={uomCode} />} />
          {/* Üretilen miktar nötr bir gerçektir (iyi/kötü sinyali değil) — renk yalnızca Fire gibi
              gerçekten uyarı taşıyan hücrede kullanılır (renk enflasyonundan kaçınma). */}
          <StatCell label="Üretilen" value={<QtyCell value={wo.producedQty} uom={uomCode} />} />
          {D(wo.scrapQty).gt(0) ? <StatCell label="Fire" value={<QtyCell value={wo.scrapQty} uom={uomCode} className="text-destructive" />} /> : null}
          {wo.yieldPct ? <StatCell label="Verim" value={<span className="num text-xl tabular-nums">%{Number(wo.yieldPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span>} /> : null}
        </div>
      </PageHeader>

      <WorkOrderTabs detail={detail} />
    </>
  );
}

/** Meta şeridi öğesi: etiket soluk 11px, değer 13px — cümle gibi okunan düz metin yerine. */
function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[11px] text-muted-foreground/70">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

/** İstatistik şeridi hücresi: etiket üstte küçük soluk, değer altta büyük tabular. */
function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-[92px] px-4 py-2.5">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-xl leading-none">{value}</div>
    </div>
  );
}

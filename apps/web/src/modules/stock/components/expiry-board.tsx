'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { formatMoney } from '@/lib/format';
import { scrapExpiredAction } from '../actions';
import type { ExpiryRow, ExpiryBuckets, ExpiryBucket } from '@plantero/core';

// Kova (ExpiryBucket, core `bucketOf()` — 0-30/30-60/60-90/geçmiş 4 dilim) ile satır rozetinin
// (ExpiryLevel — 7 günlük eşikle ayrıca bölünmüş) etiket sözlükleri kasıtlı olarak AYRI: kova
// EXPIRY_LEVEL_LABELS'ı ödünç alırsa "critical" kovası hâlâ 0-30 gün topluyorken başlıkta "8-30 gün"
// yazardı (satır rozetinin daha ince taneli eşiğiyle çelişir).
const BUCKET_LABELS: Record<ExpiryBucket, string> = { expired: 'SKT geçti', critical: '30 günden az', warning: '30–60 gün', notice: '60–90 gün' };
const BUCKET_ORDER: ExpiryBucket[] = ['expired', 'critical', 'warning', 'notice'];

export function ExpiryBoard({ buckets, canScrap }: { buckets: ExpiryBuckets; canScrap: boolean }) {
  const router = useRouter();
  const [activeBucket, setActiveBucket] = useState<ExpiryBucket | null>(null);
  const [scrapTarget, setScrapTarget] = useState<ExpiryRow | null>(null);

  const rows = useMemo(() => (activeBucket ? buckets.rows.filter((r) => r.bucket === activeBucket) : buckets.rows), [buckets.rows, activeBucket]);

  const columns = useMemo<ColumnDef<ExpiryRow, unknown>[]>(
    () => [
      { id: 'lotNo', accessorFn: (r) => r.lotNo, header: 'Lot', meta: { mobile: 'title' }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} id={row.original.lotId} /> },
      { accessorKey: 'productName', header: 'Ürün', meta: { mobile: 'subtitle' }, cell: ({ row }) => <span>{row.original.productName} <span className="font-mono text-xs text-muted-foreground">· {row.original.sku}</span></span> },
      // Diğer depo tablolarıyla aynı kalıp (Tur 3 P1): masaüstünde değişiklik yok, mobilde tek etiketli
      // meta satırında toplanır — ayrı `dl` satırları yerine kart yüksekliği düşürülür.
      {
        accessorKey: 'locationCode',
        header: 'Lokasyon',
        meta: { width: 130, mobile: 'meta' },
        cell: ({ row }) => (
          <>
            <span className="hidden font-mono text-xs md:inline">{row.original.locationCode}</span>
            <span className="md:hidden">{row.original.locationCode}</span>
          </>
        ),
      },
      {
        accessorKey: 'qty',
        header: 'Miktar',
        meta: { align: 'right', width: 110, mobile: 'meta' },
        cell: ({ row }) => (
          <>
            <span className="hidden md:inline-flex"><QtyCell value={row.original.qty} uom={row.original.uomCode} /></span>
            <span className="inline-flex items-baseline gap-1 md:hidden">
              <span className="text-muted-foreground/70">Miktar</span>
              <QtyCell value={row.original.qty} uom={row.original.uomCode} />
            </span>
          </>
        ),
      },
      {
        accessorKey: 'value',
        header: 'Değer',
        meta: { align: 'right', width: 120, mobile: 'meta' },
        cell: ({ row }) => (
          <>
            <span className="hidden md:inline-flex"><MoneyCell value={row.original.value} /></span>
            <span className="inline-flex items-baseline gap-1 md:hidden">
              <span className="text-muted-foreground/70">Değer</span>
              <MoneyCell value={row.original.value} />
            </span>
          </>
        ),
      },
      // stock-table.tsx ile aynı kök nedenle (Tur 3 P1) genişletildi — geçmiş SKT'li satırlar bu panonun
      // tam odağı, tarihin kırpılması burada özellikle kabul edilemez. Masaüstünde değişiklik yok
      // (tam rozet, tarihle birlikte). Mobilde tam rozet ('10 gün önce doldu · 24.08.2026', ~230px)
      // tek başına kartın başlık sütununu (lot no + ürün + lokasyon + değer) 94px'e sıkıştırıyordu —
      // hepsi rozetin altında kırpılıyordu (Tur 4 P0 bulgusu). stock-table.tsx/lots-table.tsx'teki
      // aynı kalıpla mobilde yalnızca kısa gün rozeti (`showDate={false}`, ör. "10g") gösterilir.
      {
        id: 'expiryDate',
        accessorFn: (r) => r.expiryDate,
        header: 'SKT',
        meta: { width: 228, mobile: 'badge' },
        cell: ({ row }) => (
          <>
            <span className="hidden md:inline-flex"><ExpiryBadge date={row.original.expiryDate} /></span>
            <span className="md:hidden"><ExpiryBadge date={row.original.expiryDate} showDate={false} /></span>
          </>
        ),
      },
    ],
    [],
  );

  return (
    <>
      {/* Modül genelinde tek KPI dili: /depo/stok ile aynı bileşen (variant="strip"), aynı 0 ondalık
          para hassasiyeti, aynı sabit yükseklik (134px yerine 80px). */}
      <KpiStripRow>
        {BUCKET_ORDER.map((b) => {
          const t = buckets.totals[b];
          const active = activeBucket === b;
          return (
            <KpiCard
              key={b}
              variant="strip"
              title={BUCKET_LABELS[b]}
              value={t.count}
              format="int"
              // Kök neden (Tur 5 P2): boş kova için "₺0" basılıyordu — bir Stripe KPI'sında "veri yok"
              // ile "gerçekten sıfır" aynı şey değildir; em-dash daha dürüst.
              hint={t.count === 0 ? '—' : formatMoney(t.qtyValue, 'TRY', { digits: 0 })}
              active={active}
              onClick={() => setActiveBucket(active ? null : b)}
              // Değeri 0 olan kova (ör. "60-90 gün: 0") tam kontrastla basılıyordu — sayfadaki tek
              // gerçekten boş dilim, dolu dilimlerle aynı ağırlığı taşıyordu (Tur 4 P2 bulgusu).
              // Kendi sol ayracı (md:border-l) de kaldırılır — boş bir dilimin şeride tam bir bölüm
              // gibi bir sınır çizmesi, dolu dilimlerle aynı ritmi taşıması yanlış sinyal verirdi.
              className={t.count === 0 ? 'opacity-60 md:border-l-0' : undefined}
            />
          );
        })}
      </KpiStripRow>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.quantId}
        searchPlaceholder="Lot, ürün ara…"
        initialSorting={[{ id: 'expiryDate', desc: false }]}
        emptyTitle="Bu aralıkta SKT'si yaklaşan lot yok"
        rowActions={canScrap ? (r) => [{ label: 'Hurdaya ayır', icon: Trash2, destructive: true, onSelect: () => setScrapTarget(r) }] : undefined}
        // Satır zemin tonu istisnayı işaretler, kuralı değil (Tur 5 P0 bulgusu): önceki sürüm
        // "critical" (0-30 gün, satırların büyük kısmı) VE "warning" (30-60 gün) kovalarını da
        // tintliyordu — 81 satırın 80'i amber zeminliydi, tek gerçek acil kayıt (SKT geçmiş) kalabalıkta
        // kayboluyordu. Artık yalnızca "expired" zeminlenir; "critical" çok daha soluk bir iz taşır,
        // "warning"/"notice" tamamen tonsuz — kalan sinyali ExpiryBadge (rozet) taşır.
        rowClassName={(r) => (r.bucket === 'expired' ? 'bg-destructive/8 hover:bg-destructive/12' : r.bucket === 'critical' ? 'bg-warning/5 hover:bg-warning/8' : undefined)}
      />

      <ConfirmDialog
        open={!!scrapTarget}
        onOpenChange={(v) => !v && setScrapTarget(null)}
        title="Lotu hurdaya ayır"
        description={scrapTarget ? `${scrapTarget.lotNo} (${scrapTarget.productName}) — ${scrapTarget.locationCode} lokasyonundaki ${scrapTarget.qty} miktar hurdaya çıkarılır.` : undefined}
        confirmLabel="Hurdaya ayır"
        destructive
        onConfirm={async () => {
          if (!scrapTarget) return;
          const res = await scrapExpiredAction({ lotId: scrapTarget.lotId, locationId: scrapTarget.locationId, reason: 'SKT geçti' });
          if (res.ok) {
            toast.success('Lot hurdaya ayrıldı');
            router.refresh();
            return undefined;
          }
          return { ok: false, error: res.error };
        }}
      />
    </>
  );
}

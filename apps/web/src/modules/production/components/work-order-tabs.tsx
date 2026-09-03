'use client';

// Not: '@plantero/core' barrel'ı sunucu-özel kod (node:crypto) içerir — bu dosya DataTable'a fonksiyon
// prop'ları (getRowId, cell render'ları) geçirdiği için istemci bileşeni olmak zorunda (bkz. altta),
// bu yüzden gösterim amaçlı Decimal hesabı için doğrudan 'decimal.js' kullanılır (planning-board.tsx
// ile aynı desen).
import Decimal from 'decimal.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { LotBadge } from '@/components/lot-badge';
import { DocumentChain } from '@/components/document-chain';
import { formatDateTime } from '@/lib/format';
import { SCRAP_REASON_LABELS, SCRAP_STAGE_LABELS, WORK_ORDER_EVENT_LABELS } from '../labels';
import type { getWorkOrderDetail } from '../queries';

type Detail = NonNullable<Awaited<ReturnType<typeof getWorkOrderDetail>>>;
type MaterialRow = Detail['materials'][number];
type ConsumptionRow = Detail['consumptions'][number];
type OutputRow = Detail['outputs'][number];
type ScrapRow = Detail['scraps'][number];

export function WorkOrderTabs({ detail }: { detail: Detail }) {
  const { wo, uomCode, materials, consumptions, outputs, scraps, events, chain } = detail;

  const materialColumns: ColumnDef<MaterialRow, unknown>[] = [
    {
      id: 'material',
      header: 'Malzeme',
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">
            {row.original.productName}
            {row.original.m.isByproduct ? <span className="ml-1.5 text-[11px] text-muted-foreground">(yan ürün)</span> : null}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">{row.original.sku}</div>
        </div>
      ),
    },
    { id: 'planned', header: 'Planlanan', meta: { align: 'right' }, cell: ({ row }) => <QtyCell value={row.original.m.plannedQty} uom={row.original.uomCode} /> },
    { id: 'consumed', header: 'Tüketilen', meta: { align: 'right' }, cell: ({ row }) => <QtyCell value={row.original.m.consumedQty} uom={row.original.uomCode} /> },
    {
      id: 'remaining',
      header: 'Kalan',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const remaining = new Decimal(row.original.m.plannedQty).minus(new Decimal(row.original.m.consumedQty));
        return <QtyCell value={remaining.toFixed(4)} uom={row.original.uomCode} className={remaining.gt(0) ? '' : 'text-success'} />;
      },
    },
  ];

  const consumptionColumns: ColumnDef<ConsumptionRow, unknown>[] = [
    {
      id: 'product',
      header: 'Ürün',
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.productName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{row.original.sku}</div>
        </div>
      ),
    },
    { id: 'lot', header: 'Lot', meta: { mobile: 'badge' }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} id={row.original.c.lotId} /> },
    { id: 'location', header: 'Lokasyon', meta: { mobile: 'meta' }, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.locationCode}</span> },
    { id: 'qty', header: 'Miktar', meta: { align: 'right' }, cell: ({ row }) => <QtyCell value={row.original.c.qty} uom={row.original.uomCode} /> },
    { id: 'value', header: 'Değer', meta: { align: 'right' }, cell: ({ row }) => <MoneyCell value={row.original.c.value} /> },
    {
      id: 'who',
      header: 'Kim / ne zaman',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.scannedByName ?? '—'} · {formatDateTime(row.original.c.consumedAt)}
        </span>
      ),
    },
  ];

  const outputColumns: ColumnDef<OutputRow, unknown>[] = [
    { id: 'lot', header: 'Lot', meta: { mobile: 'title' }, cell: ({ row }) => <LotBadge lotNo={row.original.lotNo} status={row.original.lotStatus} id={row.original.o.lotId} /> },
    { id: 'location', header: 'Lokasyon', meta: { mobile: 'meta' }, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.locationCode}</span> },
    { id: 'qty', header: 'Miktar', meta: { align: 'right' }, cell: ({ row }) => <QtyCell value={row.original.o.qty} uom={uomCode} /> },
    { id: 'unitCost', header: 'Birim maliyet', meta: { align: 'right' }, cell: ({ row }) => <MoneyCell value={row.original.o.unitCost} digits={4} /> },
    { id: 'value', header: 'Değer', meta: { align: 'right' }, cell: ({ row }) => <MoneyCell value={row.original.o.value} /> },
    { id: 'date', header: 'Tarih', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.o.producedAt)}</span> },
  ];

  const scrapColumns: ColumnDef<ScrapRow, unknown>[] = [
    { id: 'reason', header: 'Sebep', meta: { mobile: 'title' }, cell: ({ row }) => <span>{SCRAP_REASON_LABELS[row.original.s.reason] ?? row.original.s.reason}</span> },
    {
      id: 'stage',
      header: 'Aşama',
      meta: { mobile: 'subtitle' },
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.s.stage ? (SCRAP_STAGE_LABELS[row.original.s.stage] ?? row.original.s.stage) : '—'}</span>,
    },
    { id: 'qty', header: 'Miktar', meta: { align: 'right' }, cell: ({ row }) => <QtyCell value={row.original.s.qty} uom={uomCode} className="text-destructive" /> },
    { id: 'value', header: 'Değer', meta: { align: 'right' }, cell: ({ row }) => <MoneyCell value={row.original.s.value} /> },
    {
      id: 'who',
      header: 'Kim / ne zaman',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.recordedByName ?? '—'} · {formatDateTime(row.original.s.recordedAt)}
        </span>
      ),
    },
  ];

  return (
    <Tabs defaultValue="materials" className="gap-4">
      {/* -mx-4 px-4: sarmalayıcı sayfa kenarına taşar ki kaydırma tüm genişlikte olsun; aktif sekme
          hiçbir zaman programatik olarak kaydırılmıyor (scrollIntoView yok) — şerit her zaman soldan
          "Malzemeler" ile başlar. Kenar maskesi kaydırılabilir olduğuna dair görsel ipucu verir. */}
      <div className="-mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] [scroll-padding-inline:1rem] sm:mx-0 sm:px-0 sm:[mask-image:none]">
        {/* gap-6: TabsTrigger artık line varyantında flex-1 almıyor (tabs.tsx) — eşit esnemek yerine
            sola dayalı, aralarında sabit boşluklu bir sekme grubu. */}
        <TabsList variant="line" className="w-max min-w-full justify-start gap-6">
          <TabsTrigger value="materials">Malzemeler</TabsTrigger>
          <TabsTrigger value="consumptions">Tüketimler</TabsTrigger>
          <TabsTrigger value="outputs">Çıktılar</TabsTrigger>
          <TabsTrigger value="scraps">Fire</TabsTrigger>
          <TabsTrigger value="events">Olaylar</TabsTrigger>
          <TabsTrigger value="cost">Maliyet</TabsTrigger>
          <TabsTrigger value="chain">Zincir</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="materials">
        <DataTable columns={materialColumns} data={materials} getRowId={(r) => r.m.id} searchable={false} columnToggle={false} pagination={false} emptyTitle="Malzeme yok" />
      </TabsContent>

      <TabsContent value="consumptions">
        <DataTable columns={consumptionColumns} data={consumptions} getRowId={(r) => r.c.id} searchable={false} columnToggle={false} pagination={false} emptyTitle="Henüz tüketim yok" />
      </TabsContent>

      <TabsContent value="outputs">
        <DataTable columns={outputColumns} data={outputs} getRowId={(r) => r.o.id} searchable={false} columnToggle={false} pagination={false} emptyTitle="Henüz çıktı yok" />
      </TabsContent>

      <TabsContent value="scraps">
        <DataTable columns={scrapColumns} data={scraps} getRowId={(r) => r.s.id} searchable={false} columnToggle={false} pagination={false} emptyTitle="Fire kaydı yok" />
      </TabsContent>

      <TabsContent value="events">
        {events.length === 0 ? (
          <EmptyState title="Olay kaydı yok" />
        ) : (
          <ol className="space-y-0 border-l border-border/60 pl-4">
            {events.map((e) => (
              <li key={e.e.id} className="relative pb-4 last:pb-0">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-medium">{WORK_ORDER_EVENT_LABELS[e.e.kind] ?? e.e.kind}</span>
                  {e.e.reason ? <span className="text-xs text-muted-foreground">({e.e.reason})</span> : null}
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.e.at)}</span>
                  {e.userName ? <span className="text-xs text-muted-foreground">· {e.userName}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </TabsContent>

      <TabsContent value="cost">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CostTile label="Malzeme maliyeti" value={wo.materialCost} />
          <CostTile label="Genel gider payı" value={wo.overheadCost} />
          <CostTile label="Toplam maliyet" value={wo.totalCost} emphasize />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CostTile label="Birim maliyet" value={wo.unitCost} digits={4} />
          <CostTile label="Fire değeri" value={String(scraps.reduce((a, s) => a + Number(s.s.value), 0))} tone={scraps.length ? 'danger' : undefined} />
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <div className="text-[13px] font-medium text-muted-foreground">Verim</div>
            <div className="num mt-1 text-2xl font-semibold tabular-nums">{wo.yieldPct ? `%${Number(wo.yieldPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—'}</div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Malzeme maliyeti = Σ tüketim değeri · Genel gider = reçete parti sabiti + birim başına × üretilen miktar · Birim maliyet = toplam / üretilen (kapatılınca kilitlenir).
        </p>
      </TabsContent>

      <TabsContent value="chain">
        <DocumentChain
          upstream={chain.upstream}
          current={{ type: 'work_order', id: wo.id, docNo: wo.docNo, status: wo.status, date: wo.plannedStart ?? wo.createdAt, amount: wo.totalCost, partnerName: null }}
          downstream={chain.downstream}
        />
      </TabsContent>
    </Tabs>
  );
}

function CostTile({ label, value, digits = 2, emphasize, tone }: { label: string; value: string; digits?: number; emphasize?: boolean; tone?: 'danger' }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className={`num mt-1 ${emphasize ? 'text-2xl' : 'text-xl'} font-semibold tabular-nums ${tone === 'danger' ? 'text-destructive' : ''}`}>
        <MoneyCell value={value} digits={digits} className="text-inherit" />
      </div>
    </div>
  );
}

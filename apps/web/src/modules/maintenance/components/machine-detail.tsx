'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { Sparkline } from '@/components/sparkline';
import { DetailFieldGroupsGrid } from '@/components/detail-field-groups-grid';
import type { DetailFieldGroup } from '@/components/detail-fields';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { formatDate, formatDateTime, formatPct, relativeTime } from '@/lib/format';
import type { MachineDetail } from '../queries';
import { DOWNTIME_REASON_LABELS, INTERVAL_UNIT_LABELS } from '../labels';

type PlanTabRow = MachineDetail['plans'][number];
type OrderTabRow = MachineDetail['orders'][number];
type DowntimeTabRow = MachineDetail['downtimes'][number];

export function MachineDetailView({ detail }: { detail: MachineDetail }) {
  const { machine, lineCode, lineName, warehouseCode, productSku, productName, responsibleName, plans, orders, downtimes, photos, oeeTrend, mtbfHours, mttrHours, failureCount } = detail;

  // Kriter 12 (Tur 2 P1 bakim-makine-detay-06) kök neden düzeltmesi: eskiden 8 gri dolgulu StatCell +
  // "Ana veri" için ayrı çerçeveli kutu = 9 gri yüzey. Ortak `DetailFieldGroupsGrid` (Stripe/Linear
  // hairline tanım listesi) hiç gri dolgu taşımaz; boş alanlar (Kapasite/Sorumlu/MTBF sık '—' olur)
  // varsayılan gizli — Kriter 3 (bakim-makine-detay-03) bulgusundaki "3 tane görünür '—'" de böylece
  // ortadan kalkar. Kriter 1 (bakim-makine-detay-02) düzeltmesi: makine notu artık etiketsiz çıplak
  // metin değil, aynı ızgaranın "Not" alanı.
  const groups: DetailFieldGroup[] = [
    {
      title: 'Genel',
      fields: [
        { label: 'Hat', value: 1, node: lineCode ? `${lineCode} — ${lineName}` : 'Ortak / depo ekipmanı' },
        { label: 'Depo', value: warehouseCode, node: warehouseCode },
        { label: 'Kapasite', value: machine.capacityPerHour, node: machine.capacityPerHour ? <QtyCell value={machine.capacityPerHour} uom={machine.capacityUnit ?? '/sa'} /> : null },
        { label: 'Güç', value: machine.powerKw, node: machine.powerKw ? <QtyCell value={machine.powerKw} uom="kW" /> : null },
        { label: 'Çalışma saati', value: 1, node: <QtyCell value={machine.runtimeHours} uom="sa" /> },
        { label: 'Sorumlu', value: responsibleName, node: responsibleName },
        { label: 'MTBF (arızalar arası)', value: mtbfHours !== null ? mtbfHours : null, node: mtbfHours !== null ? `${mtbfHours.toFixed(1)} sa` : null },
        {
          label: 'MTTR (ort. onarım süresi)',
          value: mttrHours !== null ? mttrHours : failureCount === 0 ? 'yok' : null,
          node: mttrHours !== null ? `${mttrHours.toFixed(1)} sa` : 'Arıza yok',
        },
        { label: 'Ana veri ekipman kaydı', value: productSku, node: productSku ? <span><span className="font-mono">{productSku}</span> — {productName}</span> : null },
        { label: 'Not', value: machine.note, node: machine.note },
      ],
    },
  ];

  const recentOrders = orders.slice(0, 5);
  const recentDowntimes = downtimes.slice(0, 5);

  // Kriter 11 (Tur 3 P1 bakim-makine-detay-04) kök neden düzeltmesi: bu üç sekme ham `<Table>` ile
  // kuruluydu — modülün geri kalanındaki tek gerçek liste bileşeni `DataTable` (mobilde kart
  // görünümüne döner, 36px satır, aynı sütun başlığı tipografisi). Sütun tanımları plans-table.tsx /
  // orders-table.tsx ile birebir aynı görünüm dilini üretir (satır aksiyonu/arama olmadan — bunlar
  // salt makine bağlamındaki salt-okunur özetler, tam liste kendi route'unda zaten var).
  const planColumns = useMemo<ColumnDef<PlanTabRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: 'Plan', meta: { mobile: 'title', flex: true } },
      { id: 'interval', accessorFn: (r) => r.intervalValue, header: 'Aralık', meta: { width: 130, mobile: 'subtitle' }, cell: ({ row }) => `${row.original.intervalValue} ${INTERVAL_UNIT_LABELS[row.original.intervalUnit] ?? row.original.intervalUnit}` },
      { id: 'lastDoneAt', accessorFn: (r) => r.lastDoneAt ?? '', header: 'Son yapılan', meta: { width: 120, mobile: 'hidden' }, cell: ({ row }) => (row.original.lastDoneAt ? formatDate(row.original.lastDoneAt) : '—') },
      { id: 'nextDueAt', accessorFn: (r) => r.nextDueAt ?? '', header: 'Sonraki', meta: { width: 120, mobile: 'meta' }, cell: ({ row }) => (row.original.nextDueAt ? formatDate(row.original.nextDueAt) : '—') },
      { id: 'assignee', accessorFn: (r) => r.assigneeName ?? '', header: 'Sorumlu', meta: { width: 140, mobile: 'hidden' }, cell: ({ row }) => row.original.assigneeName ?? <span className="text-muted-foreground">—</span> },
      {
        id: 'status', accessorFn: (r) => (r.isActive ? 'active' : 'inactive'), header: 'Durum', meta: { width: 100, align: 'right', mobile: 'badge' },
        cell: ({ row }) => (row.original.isActive ? <StatusBadge status="active" label="Aktif" tone="success" /> : <StatusBadge status="inactive" label="Pasif" tone="muted" />),
      },
    ],
    [],
  );

  const orderColumns = useMemo<ColumnDef<OrderTabRow, unknown>[]>(
    () => [
      { accessorKey: 'docNo', header: 'No', meta: { mobile: 'title', className: 'font-mono', width: 130 } },
      { accessorKey: 'title', header: 'Başlık', meta: { mobile: 'subtitle', flex: true, className: 'whitespace-normal' }, cell: ({ row }) => <span className="line-clamp-1 leading-[18px] break-words whitespace-normal" title={row.original.title}>{row.original.title}</span> },
      { id: 'kind', accessorFn: (r) => r.kind, header: 'Tür', meta: { width: 100, mobile: 'hidden' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="maintenance_kind" /> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, align: 'right', mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="maintenance" /> },
      { id: 'reportedAt', accessorFn: (r) => r.reportedAt, header: 'Bildirim', meta: { width: 150, mobile: 'hidden' }, cell: ({ row }) => formatDateTime(row.original.reportedAt) },
      { id: 'downtimeMinutes', accessorFn: (r) => r.downtimeMinutes, header: 'Duruş (dk)', meta: { width: 100, align: 'right', mobile: 'meta' }, cell: ({ row }) => (row.original.downtimeMinutes ? <QtyCell value={row.original.downtimeMinutes} uom="dk" maxDigits={0} /> : <span className="text-muted-foreground">—</span>) },
    ],
    [],
  );

  const downtimeColumns = useMemo<ColumnDef<DowntimeTabRow, unknown>[]>(
    () => [
      { id: 'reason', accessorFn: (r) => DOWNTIME_REASON_LABELS[r.reason] ?? r.reason, header: 'Sebep', meta: { mobile: 'title', flex: true } },
      { id: 'startedAt', accessorFn: (r) => r.startedAt, header: 'Başlangıç', meta: { width: 170, mobile: 'subtitle' }, cell: ({ row }) => formatDateTime(row.original.startedAt) },
      { id: 'endedAt', accessorFn: (r) => r.endedAt ?? '', header: 'Bitiş', meta: { width: 170, mobile: 'hidden' }, cell: ({ row }) => (row.original.endedAt ? formatDateTime(row.original.endedAt) : <span className="text-warning">devam ediyor</span>) },
      { id: 'minutes', accessorFn: (r) => r.minutes, header: 'Dakika', meta: { width: 100, align: 'right', mobile: 'meta' }, cell: ({ row }) => (row.original.minutes ? <QtyCell value={row.original.minutes} uom="dk" maxDigits={0} /> : <span className="text-muted-foreground">—</span>) },
    ],
    [],
  );

  return (
    <Tabs defaultValue="ozellikler" className="gap-4">
      {/* Kriter 5 (Tur 2 P1 bakim-makine-detay-05) kök neden düzeltmesi: `variant="line"` (ui/tabs.tsx'te
          zaten var olan, work-order-tabs.tsx/product-detail-tabs.tsx'te kanıtlanmış varyant) — 1152px'e
          yayılan gri dolgulu 6-eşit-parçalı segment kontrolü yerine sola yaslı, içerik genişliğinde,
          seçilide 2px alt çizgili sekmeler. Ortak `ui/tabs.tsx` DEĞİŞTİRİLMEDİ, yalnızca zaten var olan
          varyant burada kullanıldı. */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList variant="line" className="w-max min-w-full justify-start gap-6 border-b border-border/60 md:w-fit md:min-w-0">
          <TabsTrigger value="ozellikler">Özellikler</TabsTrigger>
          <TabsTrigger value="planlar">Bakım planları ({plans.length})</TabsTrigger>
          <TabsTrigger value="is-emirleri">İş emirleri ({orders.length})</TabsTrigger>
          <TabsTrigger value="duruslar">Duruşlar ({downtimes.length})</TabsTrigger>
          {lineCode ? <TabsTrigger value="oee">OEE trendi</TabsTrigger> : null}
          <TabsTrigger value="fotograflar">Fotoğraflar ({photos.length})</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="ozellikler" className="space-y-8">
        <DetailFieldGroupsGrid groups={groups} />

        {/* Kriter 3 (Tur 2 P1 bakim-makine-detay-03) kök neden düzeltmesi: açılış sekmesi salt
            özellik alanlarından ibaretken (çoğu '—') 1440×900'de ekranın yarısı boş kalıyordu.
            Son iş emirleri/duruşlar/planlar özeti — ayrı sekmelerdeki tam listenin ilk birkaç satırı —
            hem boşluğu gerçek, kullanışlı bilgiyle doldurur hem de "bu makinede en son ne oldu" ve
            "sırada ne var" sorularını sekme değiştirmeden yanıtlar. */}
        {/* Kriter 9 (Tur 3 P0 bakim-makine-detay-07) kök neden düzeltmesi: `grid` tek başına, açık
            bir `grid-cols-1` olmadan, mobilde çocukların min-content'ine göre örtük tek sütuna
            genişliyordu — ızgara çocukları `min-w-0` taşımadığı için bu örtük sütun en uzun satırın
            (iş emri başlığı + rozet + tarih) min-content genişliğine (580px) şişiyor, `main` bunu
            kırpmak yerine görünüm alanının dışına taşırıyordu (main.scrollWidth 596 > 390). Açık
            `grid-cols-1` + `[&>*]:min-w-0` ızgara çocuklarını gerçekten 390px'e sabitler; içerideki
            `min-w-0 truncate` o zaman devreye girebilir. Kriter 5 (Tur 3 P1 bakim-makine-detay-08)
            kök neden düzeltmesi: 3. sütun artık yalnızca 2xl'de (≥1536px) açılıyor — 1440px'de (lg-xl
            aralığı) ızgara 2 sütunlu kalır, "Son iş emirleri" sütunu ~564px'e genişler; aynı satırda
            rozet+göreli zaman artık başlığın ALTINDA ikinci bir satırda (`flex-col`) — başlık kalan
            genişliğin tamamını (~530px) kullanır, kelime ortasından kırpma pratikte oluşmaz. */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-6 [&>*]:min-w-0 sm:grid-cols-2 2xl:grid-cols-3">
          <div>
            <h3 className="mb-2 border-t border-border/60 pt-3 text-[13px] font-semibold">Son iş emirleri</h3>
            {recentOrders.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Henüz iş emri yok.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/bakim/is-emirleri/${o.id}`} className="flex min-h-11 flex-col justify-center gap-1 py-1.5 text-[13px] hover:text-primary">
                      <span className="min-w-0 truncate">{o.title}</span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={o.status} kind="maintenance" />
                        <span className="text-[11px] text-muted-foreground">{relativeTime(o.reportedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 border-t border-border/60 pt-3 text-[13px] font-semibold">Son duruşlar</h3>
            {recentDowntimes.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Duruş kaydı yok.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {recentDowntimes.map((d) => (
                  <li key={d.id} className="flex min-h-11 items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="min-w-0 truncate">{DOWNTIME_REASON_LABELS[d.reason] ?? d.reason}</span>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                      {d.endedAt ? `${d.minutes} dk` : <span className="text-warning">devam ediyor</span>}
                      <span className="tabular-nums">{formatDate(d.startedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 border-t border-border/60 pt-3 text-[13px] font-semibold">Bakım planları</h3>
            {plans.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Periyodik plan yok.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {plans.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{p.nextDueAt ? formatDate(p.nextDueAt) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {lineCode ? (
          <div className="border-t border-border/60 pt-5">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="text-[13px] font-semibold">OEE (hat geneli — {lineCode})</h3>
              {oeeTrend.length > 0 ? <span className="text-lg font-semibold tabular-nums">{formatPct(oeeTrend[oeeTrend.length - 1]!.oeePct)}</span> : null}
            </div>
            {oeeTrend.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">OEE verisi yok. Worker `oee-daily` her gece hesaplar.</p>
            ) : (
              <>
                <Sparkline data={oeeTrend.map((d) => Number(d.oeePct))} width={1152} height={120} tone="primary" className="w-full" />
                <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                  <span>{formatDate(oeeTrend[0]!.day)}</span>
                  <span>{formatDate(oeeTrend[oeeTrend.length - 1]!.day)}</span>
                </div>
              </>
            )}
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="planlar">
        <DataTable
          columns={planColumns}
          data={plans}
          getRowId={(r) => r.id}
          searchable={false}
          filters={[]}
          columnToggle={false}
          initialSorting={[{ id: 'nextDueAt', desc: false }]}
          emptyTitle="Bakım planı yok"
          emptyDescription="Bu makine için henüz periyodik bir plan tanımlanmadı."
        />
      </TabsContent>

      <TabsContent value="is-emirleri">
        <DataTable
          columns={orderColumns}
          data={orders}
          getRowId={(r) => r.id}
          rowHref={(r) => `/bakim/is-emirleri/${r.id}`}
          searchable={false}
          filters={[]}
          columnToggle={false}
          initialSorting={[{ id: 'reportedAt', desc: true }]}
          emptyTitle="İş emri geçmişi yok"
        />
      </TabsContent>

      <TabsContent value="duruslar">
        <DataTable
          columns={downtimeColumns}
          data={downtimes}
          getRowId={(r) => r.id}
          searchable={false}
          filters={[]}
          columnToggle={false}
          initialSorting={[{ id: 'startedAt', desc: true }]}
          emptyTitle="Duruş kaydı yok"
        />
      </TabsContent>

      {lineCode ? (
        <TabsContent value="oee">
          {oeeTrend.length === 0 ? (
            <EmptyState compact title="OEE verisi yok" description="Worker `oee-daily` her gece hesaplar." />
          ) : (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Son {oeeTrend.length} gün OEE</div>
                <div className="text-lg font-semibold tabular-nums">{formatPct(oeeTrend[oeeTrend.length - 1]!.oeePct)}</div>
              </div>
              <Sparkline data={oeeTrend.map((d) => Number(d.oeePct))} width={520} height={64} tone="primary" className="w-full" />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{formatDate(oeeTrend[0]!.day)}</span>
                <span>{formatDate(oeeTrend[oeeTrend.length - 1]!.day)}</span>
              </div>
            </div>
          )}
        </TabsContent>
      ) : null}

      <TabsContent value="fotograflar">
        {photos.length === 0 ? (
          <EmptyState compact title="Fotoğraf yok" description="Arıza bildirimlerinde eklenen fotoğraflar burada listelenir." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <a key={p.id} href={`/bakim/is-emirleri/${p.orderId}`} className="group block overflow-hidden rounded-lg border border-border/60">
                <div className="relative aspect-square bg-muted">
                  {/* data: URL — next/image optimizasyonu atlanır (unoptimized), yerel base64 depolama içindir. */}
                  <Image src={p.storagePath} alt={p.fileName} fill unoptimized className="object-cover transition-transform group-hover:scale-105" />
                </div>
                <div className="p-1.5 text-[11px] text-muted-foreground">
                  <div className="truncate font-mono">{p.orderDocNo}</div>
                  <div>{formatDate(p.createdAt)}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

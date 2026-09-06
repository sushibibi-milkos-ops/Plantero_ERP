'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { Sparkline } from '@/components/sparkline';
import { DetailFieldGroupsGrid } from '@/components/detail-field-groups-grid';
import type { DetailFieldGroup } from '@/components/detail-fields';
import { formatDate, formatDateTime, formatPct, relativeTime } from '@/lib/format';
import type { MachineDetail } from '../queries';
import { DOWNTIME_REASON_LABELS, INTERVAL_UNIT_LABELS } from '../labels';

export function MachineDetailView({ detail }: { detail: MachineDetail }) {
  const { machine, lineCode, lineName, warehouseCode, productSku, productName, responsibleName, plans, orders, downtimes, photos, oeeTrend, mtbfHours, mttrHours, failureCount } = detail;
  const router = useRouter();

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
        { label: 'Hat', value: lineCode, node: lineCode ? `${lineCode} — ${lineName}` : null },
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

      <TabsContent value="ozellikler" className="space-y-5">
        <DetailFieldGroupsGrid groups={groups} />

        {/* Kriter 3 (Tur 2 P1 bakim-makine-detay-03) kök neden düzeltmesi: açılış sekmesi salt
            özellik alanlarından ibaretken (çoğu '—') 1440×900'de ekranın yarısı boş kalıyordu.
            Son iş emirleri/duruşlar özeti — ayrı sekmelerdeki tam listenin ilk 5 satırı — hem boşluğu
            gerçek, kullanışlı bilgiyle doldurur hem de "bu makinede en son ne oldu" sorusunu sekme
            değiştirmeden yanıtlar. */}
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 border-t border-border/60 pt-3 text-[13px] font-semibold">Son iş emirleri</h3>
            {recentOrders.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Henüz iş emri yok.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/bakim/is-emirleri/${o.id}`} className="flex min-h-11 items-center justify-between gap-2 py-1.5 text-[13px] hover:text-primary">
                      <span className="min-w-0 truncate">{o.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={o.status} kind="maintenance" />
                        <span className="hidden text-[11px] text-muted-foreground sm:inline">{relativeTime(o.reportedAt)}</span>
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
        </div>
      </TabsContent>

      <TabsContent value="planlar">
        {plans.length === 0 ? (
          <EmptyState compact title="Bakım planı yok" description="Bu makine için henüz periyodik bir plan tanımlanmadı." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Aralık</TableHead><TableHead>Son yapılan</TableHead><TableHead>Sonraki</TableHead><TableHead>Sorumlu</TableHead><TableHead className="text-right">Durum</TableHead></TableRow></TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.intervalValue} {INTERVAL_UNIT_LABELS[p.intervalUnit] ?? p.intervalUnit}</TableCell>
                    <TableCell>{p.lastDoneAt ? formatDate(p.lastDoneAt) : '—'}</TableCell>
                    <TableCell>{p.nextDueAt ? formatDate(p.nextDueAt) : '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.assigneeName ?? '—'}</TableCell>
                    <TableCell className="text-right">{p.isActive ? <StatusBadge status="active" label="Aktif" tone="success" /> : <StatusBadge status="inactive" label="Pasif" tone="muted" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="is-emirleri">
        {orders.length === 0 ? (
          <EmptyState compact title="İş emri geçmişi yok" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Başlık</TableHead><TableHead>Tür</TableHead><TableHead className="text-right">Durum</TableHead><TableHead>Bildirim</TableHead><TableHead className="text-right">Duruş (dk)</TableHead></TableRow></TableHeader>
              <TableBody>
                {orders.map((o) => (
                  // Kriter 8 (Tur 1 P1 bakim-makine-detay-01) kök neden düzeltmesi: `window.location.
                  // href` tam sayfa yeniden yükleme yapıyordu (beyaz flaş, istemci durumu/kaydırma
                  // konumu kaybı) — uygulamadaki TEK `window.location` kullanımıydı. `router.push`
                  // (App Router istemci taraflı gezinme) + klavye erişilebilirliği (`tabIndex`,
                  // Enter/Space, `focus-visible` halkası) — DataTable satırlarıyla (`rowHref`) aynı
                  // desen (bkz. `apps/web/src/components/data-table/data-table.tsx` `rowProps`).
                  <TableRow
                    key={o.id}
                    tabIndex={0}
                    onClick={() => router.push(`/bakim/is-emirleri/${o.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') router.push(`/bakim/is-emirleri/${o.id}`);
                    }}
                    className="cursor-pointer outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <TableCell className="font-mono text-xs">{o.docNo}</TableCell>
                    <TableCell>{o.title}</TableCell>
                    <TableCell><StatusBadge status={o.kind} kind="maintenance_kind" /></TableCell>
                    <TableCell className="text-right"><StatusBadge status={o.status} kind="maintenance" /></TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(o.reportedAt)}</TableCell>
                    <TableCell className="num text-right">{o.downtimeMinutes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="duruslar">
        {downtimes.length === 0 ? (
          <EmptyState compact title="Duruş kaydı yok" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader><TableRow><TableHead>Sebep</TableHead><TableHead>Başlangıç</TableHead><TableHead>Bitiş</TableHead><TableHead className="text-right">Dakika</TableHead></TableRow></TableHeader>
              <TableBody>
                {downtimes.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{DOWNTIME_REASON_LABELS[d.reason] ?? d.reason}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(d.startedAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.endedAt ? formatDateTime(d.endedAt) : <span className="text-warning">devam ediyor</span>}</TableCell>
                    <TableCell className="num text-right">{d.minutes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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

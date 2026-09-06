'use client';

import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { Sparkline } from '@/components/sparkline';
import { formatDate, formatDateTime, formatPct } from '@/lib/format';
import type { MachineDetail } from '../queries';

const DOWNTIME_REASON_LABELS: Record<string, string> = {
  breakdown: 'Arıza', changeover: 'Model değişimi', cleaning: 'Temizlik', material_shortage: 'Malzeme yok',
  no_operator: 'Operatör yok', planned_maintenance: 'Planlı bakım', quality_hold: 'Kalite bekletme', power: 'Elektrik kesintisi', break: 'Mola', other: 'Diğer',
};

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function MachineDetailView({ detail }: { detail: MachineDetail }) {
  const { machine, lineCode, lineName, warehouseCode, productSku, productName, responsibleName, plans, orders, downtimes, photos, oeeTrend, mtbfHours, mttrHours, failureCount } = detail;

  return (
    <Tabs defaultValue="ozellikler" className="gap-4">
      <TabsList className="scrollbar-thin w-full justify-start overflow-x-auto">
        <TabsTrigger value="ozellikler">Özellikler</TabsTrigger>
        <TabsTrigger value="planlar">Bakım planları ({plans.length})</TabsTrigger>
        <TabsTrigger value="is-emirleri">İş emirleri ({orders.length})</TabsTrigger>
        <TabsTrigger value="duruslar">Duruşlar ({downtimes.length})</TabsTrigger>
        {lineCode ? <TabsTrigger value="oee">OEE trendi</TabsTrigger> : null}
        <TabsTrigger value="fotograflar">Fotoğraflar ({photos.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="ozellikler" className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <StatCell label="Hat" value={lineCode ? `${lineCode} — ${lineName}` : 'Ortak / depo'} />
          <StatCell label="Depo" value={warehouseCode ?? '—'} />
          <StatCell label="Kapasite" value={machine.capacityPerHour ? <QtyCell value={machine.capacityPerHour} uom={machine.capacityUnit ?? '/sa'} /> : '—'} />
          <StatCell label="Güç" value={machine.powerKw ? <QtyCell value={machine.powerKw} uom="kW" /> : '—'} />
          <StatCell label="Çalışma saati" value={<QtyCell value={machine.runtimeHours} uom="sa" />} />
          <StatCell label="Sorumlu" value={responsibleName ?? '—'} />
          <StatCell label="MTBF (arızalar arası)" value={mtbfHours !== null ? `${mtbfHours.toFixed(1)} sa` : '—'} />
          <StatCell label="MTTR (ort. onarım süresi)" value={mttrHours !== null ? `${mttrHours.toFixed(1)} sa` : failureCount > 0 ? '—' : 'Arıza yok'} />
        </div>
        {productSku ? (
          <div className="rounded-lg border border-border/60 bg-card p-3 text-[13px]">
            <span className="text-muted-foreground">Ana veri ekipman kaydı: </span>
            <span className="font-mono">{productSku}</span> — {productName}
          </div>
        ) : null}
        {machine.note ? <p className="text-[13px] text-muted-foreground">{machine.note}</p> : null}
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
                    <TableCell className="text-muted-foreground">{p.intervalValue} {{ day: 'gün', week: 'hafta', month: 'ay', runtime_hours: 'çalışma saati' }[p.intervalUnit] ?? p.intervalUnit}</TableCell>
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
                  <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { window.location.href = `/bakim/is-emirleri/${o.id}`; }}>
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

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission, userCan } from '@/lib/auth';
import { getLotDetail, listLocations } from '@/modules/stock/queries';
import { LotActions } from '@/modules/stock/components/lot-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { TraceGraph } from '@/components/trace-graph';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { LOCATION_USAGE_LABELS, MOVE_KIND_LABELS } from '@/modules/stock/labels';
import { D } from '@plantero/core';

export const metadata: Metadata = { title: 'Lot Detayı' };
export const dynamic = 'force-dynamic';

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('stock.view');
  const detail = await getLotDetail(id);
  if (!detail) notFound();
  const { lot, product, quants, moves, qc, forward, backward } = detail;

  const quarantineQuants = quants.filter((q) => q.usage === 'quarantine' && D(q.qty).gt(0));
  const quarantineQty = quarantineQuants.reduce((a, q) => a.plus(D(q.qty)), D(0)).toFixed(4);
  const canRelease = userCan(user, 'quality.release') && lot.status === 'quarantine' && quarantineQuants.length > 0;

  const [allLocations] = await Promise.all([listLocations()]);
  const internalOptions = allLocations.filter((l) => l.usage === 'internal' && l.isPickable).map((l) => ({ value: l.id, label: l.code }));
  const rejectedOptions = allLocations.filter((l) => l.usage === 'rejected').map((l) => ({ value: l.id, label: l.code }));

  return (
    <>
      <PageHeader
        eyebrow="Lot"
        title={<span className="font-mono">{lot.lotNo}</span>}
        description={product ? `${product.p.name} · ${product.p.sku}` : undefined}
        actions={
          canRelease ? (
            <LotActions lotId={lot.id} quarantineQty={quarantineQty} internalLocations={internalOptions} rejectedLocations={rejectedOptions} />
          ) : lot.status === 'quarantine' ? (
            <span className="text-xs text-muted-foreground">Serbest bırakma/red için kalite yetkisi gerekir</span>
          ) : (
            <Link href={`/depo/etiket?lot=${lot.id}`} target="_blank" className="text-sm text-primary underline underline-offset-2">
              Etiket yazdır
            </Link>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={lot.status} kind="lot" size="md" />
          <StatusBadge status={lot.origin} kind="lot_origin" size="md" />
          {lot.expiryDate ? <ExpiryBadge date={lot.expiryDate} /> : null}
          <span className="text-muted-foreground">Maliyet <MoneyCell value={lot.unitCost} digits={4} className="inline" /></span>
          <span className="text-muted-foreground">İlk giriş {formatQty(lot.initialQty, product?.uomCode)}</span>
          {lot.supplierLotNo ? <span className="text-muted-foreground">Tedarikçi lotu: {lot.supplierLotNo}</span> : null}
        </div>
      </PageHeader>

      <Tabs defaultValue="quants" className="gap-4">
        <TabsList>
          <TabsTrigger value="quants">Eldeki stok</TabsTrigger>
          <TabsTrigger value="moves">Hareketler</TabsTrigger>
          <TabsTrigger value="quality">Kalite kontrol</TabsTrigger>
          <TabsTrigger value="trace">İzlenebilirlik</TabsTrigger>
        </TabsList>

        <TabsContent value="quants">
          <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lokasyon</TableHead>
                  <TableHead>Kullanım</TableHead>
                  <TableHead className="text-right">Eldeki</TableHead>
                  <TableHead className="text-right">Rezerve</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <EmptyState compact title="Eldeki stok yok" />
                    </TableCell>
                  </TableRow>
                ) : (
                  quants.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-xs">{q.locationCode}</TableCell>
                      <TableCell><StatusBadge status={q.usage} label={LOCATION_USAGE_LABELS[q.usage] ?? q.usage} tone={q.usage === 'quarantine' ? 'warning' : q.usage === 'rejected' ? 'danger' : 'neutral'} /></TableCell>
                      <TableCell className="text-right"><QtyCell value={q.qty} uom={product?.uomCode} /></TableCell>
                      <TableCell className="text-right"><QtyCell value={q.reserved} uom={product?.uomCode} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="moves">
          <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hareket</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead className="text-right">Miktar</TableHead>
                  <TableHead className="text-right">Değer</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState compact title="Hareket yok" />
                    </TableCell>
                  </TableRow>
                ) : (
                  moves.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.moveNo}</TableCell>
                      <TableCell><StatusBadge status={m.kind} label={MOVE_KIND_LABELS[m.kind] ?? m.kind} tone="neutral" /></TableCell>
                      <TableCell className="text-right"><QtyCell value={m.qty} uom={product?.uomCode} /></TableCell>
                      <TableCell className="text-right"><MoneyCell value={m.value} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.movedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="quality">
          {qc.length === 0 ? (
            <EmptyState title="Kalite kontrol kaydı yok" description="Girişte kontrol zorunlu değilse bu bölüm boş kalır." />
          ) : (
            <div className="space-y-2">
              {qc.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-3 text-sm">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{c.docNo}</div>
                    <div>{c.kind === 'incoming' ? 'Girişte kontrol' : c.kind}</div>
                  </div>
                  <StatusBadge status={c.result} kind="qc" />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trace" className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Geriye izleme (kaynak)</h3>
            <div className="rounded-lg border border-border/70 bg-card p-3">
              <TraceGraph nodes={backward.nodes} edges={backward.edges} rootId={backward.rootId} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">İleriye izleme (gidiş)</h3>
            <div className="rounded-lg border border-border/70 bg-card p-3">
              <TraceGraph nodes={forward.nodes} edges={forward.edges} rootId={forward.rootId} />
            </div>
          </div>
          <Link href={`/kalite/izlenebilirlik?lot=${lot.id}`} className="text-sm text-primary underline underline-offset-2">
            Kalite modülünde detaylı izlenebilirlik / geri çağırma simülasyonu →
          </Link>
        </TabsContent>
      </Tabs>
      <p className="mt-2 text-xs text-muted-foreground">{formatDate(lot.createdAt)} tarihinde oluşturuldu</p>
    </>
  );
}

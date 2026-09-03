import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { LotBadge } from '@/components/lot-badge';
import { DocumentChain } from '@/components/document-chain';
import { formatDateTime } from '@/lib/format';
import { D } from '@plantero/core';
import { SCRAP_REASON_LABELS, SCRAP_STAGE_LABELS, WORK_ORDER_EVENT_LABELS } from '../labels';
import type { getWorkOrderDetail } from '../queries';

type Detail = NonNullable<Awaited<ReturnType<typeof getWorkOrderDetail>>>;

export function WorkOrderTabs({ detail }: { detail: Detail }) {
  const { wo, uomCode, materials, consumptions, outputs, scraps, events, chain } = detail;

  return (
    <Tabs defaultValue="materials" className="gap-4">
      {/* -mx-4 px-4: sarmalayıcı sayfa kenarına taşar ki kaydırma tüm genişlikte olsun; aktif sekme
          hiçbir zaman programatik olarak kaydırılmıyor (scrollIntoView yok) — şerit her zaman soldan
          "Malzemeler" ile başlar. Kenar maskesi kaydırılabilir olduğuna dair görsel ipucu verir. */}
      <div className="-mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] [scroll-padding-inline:1rem] sm:mx-0 sm:px-0 sm:[mask-image:none]">
        <TabsList variant="line" className="w-max min-w-full justify-start">
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
        <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Malzeme</TableHead>
                <TableHead className="text-right">Planlanan</TableHead>
                <TableHead className="text-right">Tüketilen</TableHead>
                <TableHead className="text-right">Kalan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.length === 0 ? (
                <TableRow><TableCell colSpan={4}><EmptyState compact title="Malzeme yok" /></TableCell></TableRow>
              ) : (
                materials.map((m) => {
                  const remaining = D(m.m.plannedQty).minus(D(m.m.consumedQty));
                  return (
                    <TableRow key={m.m.id}>
                      <TableCell>
                        <div>{m.productName}{m.m.isByproduct ? <span className="ml-1.5 text-[11px] text-muted-foreground">(yan ürün)</span> : null}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{m.sku}</div>
                      </TableCell>
                      <TableCell className="text-right"><QtyCell value={m.m.plannedQty} uom={m.uomCode} /></TableCell>
                      <TableCell className="text-right"><QtyCell value={m.m.consumedQty} uom={m.uomCode} /></TableCell>
                      <TableCell className="text-right"><QtyCell value={remaining.toFixed(4)} uom={m.uomCode} className={remaining.gt(0) ? '' : 'text-success'} /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="consumptions">
        <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Lokasyon</TableHead>
                <TableHead className="text-right">Miktar</TableHead>
                <TableHead className="text-right">Değer</TableHead>
                <TableHead>Kim / ne zaman</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consumptions.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState compact title="Henüz tüketim yok" /></TableCell></TableRow>
              ) : (
                consumptions.map((c) => (
                  <TableRow key={c.c.id}>
                    <TableCell>
                      <div>{c.productName}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{c.sku}</div>
                    </TableCell>
                    <TableCell><LotBadge lotNo={c.lotNo} id={c.c.lotId} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.locationCode}</TableCell>
                    <TableCell className="text-right"><QtyCell value={c.c.qty} uom={c.uomCode} /></TableCell>
                    <TableCell className="text-right"><MoneyCell value={c.c.value} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.scannedByName ?? '—'} · {formatDateTime(c.c.consumedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="outputs">
        <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Lokasyon</TableHead>
                <TableHead className="text-right">Miktar</TableHead>
                <TableHead className="text-right">Birim maliyet</TableHead>
                <TableHead className="text-right">Değer</TableHead>
                <TableHead>Tarih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outputs.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState compact title="Henüz çıktı yok" /></TableCell></TableRow>
              ) : (
                outputs.map((o) => (
                  <TableRow key={o.o.id}>
                    <TableCell><LotBadge lotNo={o.lotNo} status={o.lotStatus} id={o.o.lotId} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{o.locationCode}</TableCell>
                    <TableCell className="text-right"><QtyCell value={o.o.qty} uom={uomCode} /></TableCell>
                    <TableCell className="text-right"><MoneyCell value={o.o.unitCost} digits={4} /></TableCell>
                    <TableCell className="text-right"><MoneyCell value={o.o.value} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(o.o.producedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="scraps">
        <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sebep</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead className="text-right">Miktar</TableHead>
                <TableHead className="text-right">Değer</TableHead>
                <TableHead>Kim / ne zaman</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scraps.length === 0 ? (
                <TableRow><TableCell colSpan={5}><EmptyState compact title="Fire kaydı yok" /></TableCell></TableRow>
              ) : (
                scraps.map((s) => (
                  <TableRow key={s.s.id}>
                    <TableCell>{SCRAP_REASON_LABELS[s.s.reason] ?? s.s.reason}</TableCell>
                    <TableCell className="text-muted-foreground">{s.s.stage ? (SCRAP_STAGE_LABELS[s.s.stage] ?? s.s.stage) : '—'}</TableCell>
                    <TableCell className="text-right"><QtyCell value={s.s.qty} uom={uomCode} className="text-destructive" /></TableCell>
                    <TableCell className="text-right"><MoneyCell value={s.s.value} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.recordedByName ?? '—'} · {formatDateTime(s.s.recordedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
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

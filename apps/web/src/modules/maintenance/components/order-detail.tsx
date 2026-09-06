'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MoneyCell } from '@/components/money-cell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatDateTime } from '@/lib/format';
import { startOrderAction, markWaitingPartsAction, updateChecklistAction, completeOrderAction, cancelOrderAction } from '../actions';
import type { MaintenanceOrderDetail } from '../queries';
import { DOWNTIME_REASON_LABELS } from '../labels';

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function OrderDetailView({ detail, canExecute }: { detail: MaintenanceOrderDetail; canExecute: boolean }) {
  const router = useRouter();
  const { order, machine, plan, assigneeName, reportedByName, photos, downtime, workOrderDocNo } = detail;
  const [pending, setPending] = useState(false);
  const [checklist, setChecklist] = useState(order.checklistResults ?? []);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rootCause, setRootCause] = useState(order.rootCause ?? '');
  const [resolution, setResolution] = useState(order.resolution ?? '');
  const [laborMinutes, setLaborMinutes] = useState(String(order.laborMinutes ?? 0));
  const [laborCost, setLaborCost] = useState(order.laborCost ?? '0');
  const [partsCost, setPartsCost] = useState(order.partsCost ?? '0');

  const isOpen = !['done', 'cancelled'].includes(order.status);

  async function run<T>(action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, successMsg: string) {
    setPending(true);
    const res = await action();
    setPending(false);
    if (res.ok) {
      toast.success(successMsg);
      router.refresh();
    } else {
      toast.error(res.error);
    }
    return res;
  }

  async function toggleChecklistItem(i: number) {
    const next = checklist.map((c, idx) => (idx === i ? { ...c, done: !c.done } : c));
    setChecklist(next);
    const res = await updateChecklistAction({ id: order.id, checklistResults: next });
    if (!res.ok) {
      setChecklist(checklist);
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCell label="Makine" value={<Link href={`/bakim/makineler/${machine.id}`} className="text-primary hover:underline">{machine.code}</Link>} />
        <StatCell label="Bildiren" value={reportedByName ?? '—'} />
        <StatCell label="Sorumlu" value={assigneeName ?? '—'} />
        <StatCell label="Duruş" value={downtime ? `${downtime.minutes || (downtime.endedAt ? 0 : '—')} dk` : '—'} />
      </div>

      {plan ? (
        <div className="rounded-lg border border-border/60 bg-card p-3 text-[13px]">
          <span className="text-muted-foreground">Periyodik plan: </span>
          <Link href={`/bakim/planlar`} className="text-primary hover:underline">{plan.name}</Link>
        </div>
      ) : null}
      {workOrderDocNo ? (
        <div className="rounded-lg border border-border/60 bg-card p-3 text-[13px]">
          <span className="text-muted-foreground">Üretim iş emri: </span>
          <span className="font-mono">{workOrderDocNo}</span>
        </div>
      ) : null}

      {order.description ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Açıklama</h2>
          <p className="text-[13px] whitespace-pre-wrap">{order.description}</p>
        </div>
      ) : null}

      {checklist.length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Kontrol listesi</h2>
          <div className="space-y-2.5">
            {checklist.map((c, i) => (
              <label key={i} className="flex items-center gap-2.5 text-[13px]">
                <Checkbox checked={c.done} onCheckedChange={() => toggleChecklistItem(i)} disabled={!canExecute || !isOpen} />
                <span className={c.done ? 'text-muted-foreground line-through' : ''}>{c.item}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {(order.rootCause || order.resolution || Number(order.laborCost) > 0 || Number(order.partsCost) > 0) ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Tanı ve maliyet</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCell label="İşçilik (dk)" value={order.laborMinutes || '—'} />
            <StatCell label="İşçilik tutarı" value={<MoneyCell value={order.laborCost} />} />
            <StatCell label="Parça tutarı" value={<MoneyCell value={order.partsCost} />} />
            <StatCell label="Toplam" value={<MoneyCell value={String(Number(order.laborCost) + Number(order.partsCost))} className="font-semibold" />} />
          </div>
          {order.rootCause ? <p className="mt-3 text-[13px]"><span className="text-muted-foreground">Kök neden: </span>{order.rootCause}</p> : null}
          {order.resolution ? <p className="mt-1 text-[13px]"><span className="text-muted-foreground">Çözüm: </span>{order.resolution}</p> : null}
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Fotoğraflar ({photos.length})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-lg border border-border/60">
                <div className="relative aspect-square bg-muted">
                  <Image src={p.storagePath} alt={p.fileName} fill unoptimized className="object-cover" />
                </div>
                <div className="p-1.5 text-[11px] text-muted-foreground">{formatDateTime(p.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {downtime ? (
        <div className="rounded-lg border border-border/60 bg-card p-3 text-[13px]">
          <span className="text-muted-foreground">Duruş: </span>
          {DOWNTIME_REASON_LABELS[downtime.reason] ?? downtime.reason} — {formatDateTime(downtime.startedAt)}
          {downtime.endedAt ? ` → ${formatDateTime(downtime.endedAt)} (${downtime.minutes} dk)` : <span className="text-warning"> devam ediyor</span>}
        </div>
      ) : null}

      {canExecute && isOpen ? (
        <div className="sticky bottom-16 -mx-4 z-20 flex flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-3 shadow-[0_-1px_2px_rgb(0_0_0/0.04)] md:static md:mx-0 md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none">
          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          {['reported', 'planned', 'waiting_parts'].includes(order.status) ? (
            <Button onClick={() => run(() => startOrderAction({ id: order.id }), 'İş emri işleme alındı')} disabled={pending}>
              <Play className="size-4" /> İşleme al
            </Button>
          ) : null}
          {order.status === 'in_progress' ? (
            <Button variant="outline" onClick={() => run(() => markWaitingPartsAction({ id: order.id }), 'Parça bekliyor olarak işaretlendi')} disabled={pending}>
              Parça bekliyor
            </Button>
          ) : null}
          <Button variant="outline" className="border-success/40 text-success hover:bg-success/10" onClick={() => setCompleteOpen(true)} disabled={pending}>
            <CheckCircle2 className="size-4" /> Tamamla
          </Button>
          <ConfirmDialog
            open={completeOpen}
            onOpenChange={setCompleteOpen}
            title={`İş emrini tamamla — ${order.docNo}`}
            description="Açık duruş kapanır, makine (başka açık iş emri yoksa) boşta durumuna döner."
            confirmLabel="Tamamla"
            onConfirm={() =>
              completeOrderAction({ id: order.id, rootCause: rootCause || null, resolution: resolution || null, laborMinutes: Number(laborMinutes) || 0, laborCost, partsCost }).then((res) => {
                if (res.ok) {
                  toast.success('İş emri tamamlandı');
                  router.refresh();
                }
                return res;
              })
            }
          >
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Kök neden</Label>
                <Textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={2} placeholder="Ör. conta aşınmış" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Çözüm</Label>
                <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} placeholder="Ör. conta değiştirildi" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">İşçilik (dk)</Label>
                  <Input type="number" inputMode="numeric" value={laborMinutes} onChange={(e) => setLaborMinutes(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">İşçilik (₺)</Label>
                  <Input inputMode="decimal" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Parça (₺)</Label>
                  <Input inputMode="decimal" value={partsCost} onChange={(e) => setPartsCost(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>
          </ConfirmDialog>
          <ConfirmDialog
            trigger={<Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending}><XCircle className="size-4" /> İptal et</Button>}
            title={`İş emrini iptal et — ${order.docNo}`}
            description="Açık duruş varsa kapatılır, başka açık iş emri kalmadıysa makine boşta durumuna döner."
            destructive
            confirmLabel="İptal et"
            onConfirm={() =>
              cancelOrderAction({ id: order.id }).then((res) => {
                if (res.ok) {
                  toast.success('İş emri iptal edildi');
                  router.refresh();
                }
                return res;
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

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
import { QtyCell } from '@/components/qty-cell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { DetailFieldGroupsGrid } from '@/components/detail-field-groups-grid';
import type { DetailFieldGroup } from '@/components/detail-fields';
import { formatDate, formatDateTime, relativeTime } from '@/lib/format';
import { startOrderAction, markWaitingPartsAction, updateChecklistAction, completeOrderAction, cancelOrderAction } from '../actions';
import type { MaintenanceOrderDetail } from '../queries';
import { DOWNTIME_REASON_LABELS, MACHINE_CATEGORY_LABELS } from '../labels';
import { OrderTimeline } from './order-timeline';

export function OrderDetailView({ detail, canExecute }: { detail: MaintenanceOrderDetail; canExecute: boolean }) {
  const router = useRouter();
  const { order, machine, lineCode, lineName, machineResponsibleName, nextPlan, relatedOrders, plan, assigneeName, reportedByName, photos, downtime, workOrderDocNo, events } = detail;
  const [pending, setPending] = useState(false);
  const [checklist, setChecklist] = useState(order.checklistResults ?? []);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rootCause, setRootCause] = useState(order.rootCause ?? '');
  const [resolution, setResolution] = useState(order.resolution ?? '');
  const [laborMinutes, setLaborMinutes] = useState(String(order.laborMinutes ?? 0));
  const [laborCost, setLaborCost] = useState(order.laborCost ?? '0');
  const [partsCost, setPartsCost] = useState(order.partsCost ?? '0');

  const isOpen = !['done', 'cancelled'].includes(order.status);
  const totalCost = String(Number(order.laborCost) + Number(order.partsCost));

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

  // Duruş: tek bir açıklayıcı metin — eskiden aynı bilgi hem üstteki StatCell'de (yalnızca dakika)
  // HEM sayfa altında ayrı 1152px'lik çerçeveli bir kutuda (sebep + saat) tekrar ediliyordu (Kriter 5,
  // Tur 2 P1 bakim-isemirleri-detay-03). Artık TEK yerde, alan ızgarasının bir satırı olarak.
  const downtimeNode = downtime ? (
    <span>
      {DOWNTIME_REASON_LABELS[downtime.reason] ?? downtime.reason} — {formatDateTime(downtime.startedAt)}
      {downtime.endedAt ? ` → ${formatDateTime(downtime.endedAt)} (${downtime.minutes} dk)` : <span className="text-warning"> devam ediyor</span>}
    </span>
  ) : null;

  // Kriter 12 (Tur 2 P1 bakim-isemirleri-detay-08) kök neden düzeltmesi: eskiden 8 gri dolgulu
  // StatCell + tek satırlık bilgiler için 2 AYRI çerçeveli kutu (plan/üretim iş emri) — 11 kap
  // toplamı "kutu içinde kutu" görüntüsü veriyordu. Ortak `DetailFieldGroupsGrid` (ürün/cari
  // detaylarında zaten kanıtlanmış hairline tanım listesi deseni) hiçbir gri dolgu/çerçeve
  // taşımaz; boş alanlar varsayılan gizli ("Boş alanları göster" ile açılır). Bu, ayrıca sparse
  // (yeni bildirilmiş) bir iş emrinde ekranın yarısının boş kalması sorununu da (Kriter 3,
  // bakim-isemirleri-detay-04) makine bağlamını (kategori/hat/durum/kapasite) göstererek azaltır.
  const groups: DetailFieldGroup[] = [
    {
      title: 'İş emri',
      fields: [
        {
          label: 'Makine',
          value: machine.id,
          // Kriter 9 (Tur 3 P1 bakim-isemirleri-detay-09) kök neden düzeltmesi: bağlantı metnin
          // satır içi (13px) yüksekliğine sığıyordu — 390x844'te tek gerçek 44px altı dokunma hedefi.
          // `inline-flex min-h-11 items-center` dokunma alanını dikeyde büyütür; `-my-1.5` bunu alan
          // ızgarasının satır ritmine (label/value arası boşluk) sızdırmadan yapar (yalnızca dokunma
          // kutusu büyür, görünür metin konumu/satır aralığı değişmez).
          node: (
            <Link href={`/bakim/makineler/${machine.id}`} className="-my-1.5 inline-flex min-h-11 items-center text-primary hover:underline">
              {machine.code} — {machine.name}
            </Link>
          ),
        },
        { label: 'Tür', value: order.kind, node: <StatusBadge status={order.kind} kind="maintenance_kind" /> },
        { label: 'Bildiren', value: reportedByName, node: reportedByName },
        { label: 'Sorumlu', value: assigneeName, node: assigneeName },
        { label: 'Bildirilme', value: order.reportedAt, node: formatDateTime(order.reportedAt) },
        { label: 'Planlanan', value: order.scheduledFor, node: order.scheduledFor ? formatDate(order.scheduledFor) : null },
        { label: 'Başlangıç', value: order.startedAt, node: order.startedAt ? formatDateTime(order.startedAt) : null },
        { label: 'Bitiş', value: order.finishedAt, node: order.finishedAt ? formatDateTime(order.finishedAt) : null },
        { label: 'Duruş', value: downtime, node: downtimeNode },
        { label: 'Periyodik plan', value: plan, node: plan ? <Link href="/bakim/planlar" className="text-primary hover:underline">{plan.name}</Link> : null },
        { label: 'Üretim iş emri', value: workOrderDocNo, node: <span className="font-mono">{workOrderDocNo}</span> },
        { label: 'Not', value: order.note, node: order.note },
      ],
    },
    {
      title: 'Makine bilgisi',
      fields: [
        { label: 'Kategori', value: machine.category, node: MACHINE_CATEGORY_LABELS[machine.category] ?? machine.category },
        { label: 'Hat', value: lineCode, node: lineCode ? `${lineCode} — ${lineName}` : null },
        { label: 'Durum', value: machine.status, node: <StatusBadge status={machine.status} kind="machine" /> },
        {
          // Kriter 6/11 (Tur 3 P1 bakim-isemirleri-detay-10/11) kök neden düzeltmesi: bu üç alan ham
          // `numeric(18,4)` dizesini şablon literaliyle basıyordu ("5.0000 kW", "0.0000 sa") — modülün
          // geri kalanı (MoneyCell %2, QtyCell max 3 basamak) hiçbir yerde 4 ondalık basamak
          // göstermez, ayrıca `font-variant-numeric` düz metinde 'normal' kalıyordu (tabular-nums yok).
          // Aynı makinenin `/bakim/makineler/[id]` sayfasında (machine-detail.tsx:34-36) BİREBİR AYNI
          // alanlar zaten `QtyCell` ile basılıyordu — iki kardeş ekran aynı veriyi iki farklı biçimde
          // gösteriyordu (kriter 11). Tek düzeltme her iki bulguyu da kapatır.
          label: 'Kapasite',
          value: machine.capacityPerHour,
          node: machine.capacityPerHour ? <QtyCell value={machine.capacityPerHour} uom={machine.capacityUnit ?? '/sa'} /> : null,
        },
        { label: 'Güç', value: machine.powerKw, node: machine.powerKw ? <QtyCell value={machine.powerKw} uom="kW" /> : null },
        { label: 'Çalışma saati', value: machine.runtimeHours, node: <QtyCell value={machine.runtimeHours} uom="sa" /> },
        { label: 'Makine sorumlusu', value: machineResponsibleName, node: machineResponsibleName },
        { label: 'Sonraki planlı bakım', value: nextPlan, node: nextPlan ? <span>{nextPlan.name}{nextPlan.nextDueAt ? ` — ${formatDate(nextPlan.nextDueAt)}` : ''}</span> : null },
      ],
    },
    {
      title: 'Tanı ve maliyet',
      fields: [
        { label: 'İşçilik (dk)', value: order.laborMinutes || null, node: order.laborMinutes },
        { label: 'İşçilik tutarı', value: Number(order.laborCost) > 0 ? order.laborCost : null, node: <MoneyCell value={order.laborCost} /> },
        { label: 'Parça tutarı', value: Number(order.partsCost) > 0 ? order.partsCost : null, node: <MoneyCell value={order.partsCost} /> },
        { label: 'Toplam', value: Number(totalCost) > 0 ? totalCost : null, node: <MoneyCell value={totalCost} className="font-semibold" /> },
        { label: 'Kök neden', value: order.rootCause, node: order.rootCause },
        { label: 'Çözüm', value: order.resolution, node: order.resolution },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <DetailFieldGroupsGrid groups={groups} />

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

      <OrderTimeline events={events} />

      <div>
        <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bu makinenin diğer iş emirleri</h2>
        {relatedOrders.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{machine.code} için başka iş emri yok — bu ilk kayıt.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {relatedOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/bakim/is-emirleri/${o.id}`} className="flex min-h-11 items-center justify-between gap-2 py-1.5 text-[13px] hover:text-primary">
                  <span className="min-w-0 truncate">{o.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={o.status} kind="maintenance" />
                    <span className="text-[11px] text-muted-foreground">{relativeTime(o.reportedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

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
          {/* Kriter 4 (Tur 1 P1 bakim-isemirleri-detay-01) kök neden düzeltmesi: eskiden 'İşleme al'
              (dolu yeşil primary) yanında 'Tamamla' de KENDİ yeşil tonunu (`border-success/40 text-
              success`) taşıyordu — aynı ekranda iki yeşil buton hangisinin birincil eylem olduğunu
              belirsizleştiriyordu. 'Tamamla' artık nötr `outline` (ikincil eylem); yeşil yalnızca
              gerçek birincil eylemde ('İşleme al', varsayılan buton) kalır. Kırmızı da yalnızca
              aşağıdaki onay diyaloğunun İÇİNDEKİ onay butonunda (`ConfirmDialog destructive`). */}
          <Button variant="outline" onClick={() => setCompleteOpen(true)} disabled={pending}>
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
            trigger={<Button variant="ghost" disabled={pending}><XCircle className="size-4" /> İptal et</Button>}
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

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Play, Pause, PlayCircle, ScanBarcode, Flame, CheckCircle2, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { NumberInput } from '@/components/form/number-input';
import { QtyCell } from '@/components/qty-cell';
import { LotBadge } from '@/components/lot-badge';
import { cn } from '@/lib/utils';
// Not: '@plantero/core' barrel'ı sunucu-özel kod (node:crypto) içerir — istemci bileşeninde yalnızca
// gösterim amaçlı hesaplama için doğrudan 'decimal.js' kullanılır (D yerine).
import Decimal from 'decimal.js';
import { SCRAP_REASON_LABELS, SCRAP_STAGE_LABELS, DOWNTIME_REASON_LABELS } from '../labels';
import { startWorkOrderAction, pauseWorkOrderAction, resumeWorkOrderAction, scanConsumeAction, autoConsumeRemainingAction, recordScrapAction, finishWorkOrderAction } from '../actions';
import type { getWorkOrderDetail } from '../queries';

type Detail = NonNullable<Awaited<ReturnType<typeof getWorkOrderDetail>>>;

export function OperatorWorkOrder({ detail, lineCode, backHref = '/operator' }: { detail: Detail; lineCode: string; backHref?: string }) {
  const router = useRouter();
  const { wo, product, uomCode, materials, consumptions } = detail;
  const [pending, startTransition] = useTransition();
  const [scrapOpen, setScrapOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [fefoWarning, setFefoWarning] = useState<{ code: string; expectedLotNo: string | null } | null>(null);

  const totalPlanned = useMemo(() => materials.filter((m) => !m.m.isByproduct).reduce((a, m) => a.plus(new Decimal(m.m.plannedQty)), new Decimal(0)), [materials]);
  const totalConsumed = useMemo(() => materials.filter((m) => !m.m.isByproduct).reduce((a, m) => a.plus(new Decimal(m.m.consumedQty)), new Decimal(0)), [materials]);
  const consumedPct = totalPlanned.gt(0) ? Math.min(100, totalConsumed.div(totalPlanned).mul(100).toNumber()) : 0;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    // lg:max-w-5xl: operator/page.tsx (hat seçimi) Tur 2'de 1024×768 tablette lg:max-w-5xl'e
    // çıkarılmıştı, bu ekran max-w-3xl'de (768px) kalmıştı — aynı terminalin iki sayfası iki farklı
    // genişlikte açılıyordu, 12 malzemelik reçete tek kolonda 1421px'e uzayıp "Bitir" sonrası bağlamı
    // ekran dışına itiyordu (Tur 3 bulgusu, P1).
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-4 lg:max-w-5xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => router.push(backHref)} aria-label="Geri dön">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{lineCode}</span>
            <span>·</span>
            <span className="font-mono">{wo.docNo}</span>
          </div>
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{product.name}</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Planlanan" value={<QtyCell value={wo.plannedQty} uom={uomCode} className="text-lg" />} />
        <StatTile label="Üretilen" value={<QtyCell value={wo.producedQty} uom={uomCode} className="text-lg text-success" />} />
        <ElapsedTile startedAt={wo.startedAt} status={wo.status} />
        <StatTile label="Malzeme" value={<span className="num text-lg">%{consumedPct.toFixed(0)}</span>} />
      </div>

      {['in_progress', 'paused'].includes(wo.status) ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ScanBarcode className="size-4" /> Lot okut
          </div>
          <BarcodeInput workOrderId={wo.id} disabled={pending} onFefoWarning={(code, expectedLotNo) => setFefoWarning({ code, expectedLotNo })} onSuccess={() => router.refresh()} />
        </div>
      ) : null}

      {/* Aksiyon hiyerarşisi: geri alınamaz "Bitir" artık en yüksek görsel ağırlığı taşımıyor —
          Duraklat/Devam et, Fire gir ve Bitir üç eşit hücrede (grid-cols-3, hepsi h-20); Bitir
          `tone="accent"` ile yalnızca çerçeve/metin rengiyle vurgulanır, dolu değil (onay diyaloğu
          zaten var, tekrar "birincil buton" ağırlığına gerek yok). */}
      <div className="grid grid-cols-3 gap-3">
        {wo.status === 'released' ? (
          <ActionTile label="Başlat" icon={Play} onClick={() => run(() => startWorkOrderAction({ id: wo.id }), 'İş emri başlatıldı')} disabled={pending} className="col-span-3" primary />
        ) : null}
        {wo.status === 'in_progress' ? (
          <ActionTile label="Duraklat" icon={Pause} onClick={() => setPauseOpen(true)} disabled={pending} />
        ) : null}
        {wo.status === 'paused' ? (
          <ActionTile label="Devam et" icon={PlayCircle} onClick={() => run(() => resumeWorkOrderAction({ id: wo.id }), 'İş emri devam ediyor')} disabled={pending} primary />
        ) : null}
        {['in_progress', 'paused'].includes(wo.status) ? (
          <>
            <ActionTile label="Fire gir" icon={Flame} onClick={() => setScrapOpen(true)} disabled={pending} tone="warning" />
            <ActionTile label="Bitir" icon={CheckCircle2} onClick={() => setFinishOpen(true)} disabled={pending} tone="accent" />
          </>
        ) : null}
      </div>

      <MaterialsChecklist materials={materials} uomFallback={uomCode} />

      {consumptions.length ? (
        <div>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Son tüketimler</h2>
          <div className="space-y-1.5">
            {consumptions.slice(0, 5).map((c) => (
              <div key={c.c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.productName}</div>
                  <LotBadge lotNo={c.lotNo} className="mt-0.5" />
                </div>
                <QtyCell value={c.c.qty} uom={c.uomCode} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <FefoDialog
        warning={fefoWarning}
        workOrderId={wo.id}
        onClose={() => setFefoWarning(null)}
        onResolved={() => router.refresh()}
      />
      <PauseDialog workOrderId={wo.id} open={pauseOpen} onOpenChange={setPauseOpen} onDone={() => router.refresh()} />
      <ScrapDialog workOrderId={wo.id} uomCode={uomCode} open={scrapOpen} onOpenChange={setScrapOpen} onDone={() => router.refresh()} />
      <FinishDialog
        workOrderId={wo.id}
        uomCode={uomCode}
        remainingPlannedQty={new Decimal(wo.plannedQty).minus(new Decimal(wo.producedQty)).toFixed(4)}
        open={finishOpen}
        onOpenChange={setFinishOpen}
        onDone={() => router.push(backHref)}
      />
    </div>
  );
}

/* ==================================================================== */

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 text-center">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 flex justify-center">{value}</div>
    </div>
  );
}

function ElapsedTile({ startedAt, status }: { startedAt: Date | null; status: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (status !== 'in_progress') return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Başlangıcı gelecekte olan bir iş emri (ör. seed tarihi terminal saatinden ileri kaldıysa) negatif
  // farkı Math.max(0,...) ile 00:00:00'a sabitliyordu — çalışan bir kronometrenin sıfırda donmuş
  // görünmesi operatörde "ekran donmuş" izlenimi bırakıyordu (Tur 3 bulgusu, P2).
  const notStarted = Boolean(startedAt && now && startedAt.getTime() > now.getTime());
  const elapsed = startedAt && now && !notStarted ? Math.floor((now.getTime() - startedAt.getTime()) / 1000) : null;
  const text = notStarted ? 'Başlamadı' : elapsed === null ? '--:--:--' : `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 text-center">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{status === 'paused' ? 'Duraklatıldı' : 'Süre'}</div>
      <div className={cn('num mt-1 text-lg tabular-nums', status === 'paused' && 'text-warning')}>{text}</div>
    </div>
  );
}

function ActionTile({ label, icon: Icon, onClick, disabled, primary, tone, className }: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; disabled?: boolean; primary?: boolean; tone?: 'warning' | 'accent'; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-50',
        primary ? 'border-transparent bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'border-border/70 bg-card',
        tone === 'warning' && !primary && 'border-warning/40 text-[oklch(0.5_0.14_70)] dark:text-warning',
        // "Bitir": geri alınamaz ama onay diyaloğu zaten koruyor — dolu birincil yerine yalnızca
        // çerçeve/metin vurgusu (Duraklat/Fire gir ile aynı görsel ağırlıkta, ayırt edilebilir).
        tone === 'accent' && !primary && 'border-primary/50 text-primary',
        className,
      )}
    >
      <Icon className="size-6" />
      {label}
    </button>
  );
}

function MaterialsChecklist({ materials, uomFallback }: { materials: Detail['materials']; uomFallback: string }) {
  const real = materials.filter((m) => !m.m.isByproduct);
  if (!real.length) return null;
  return (
    <div>
      <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Reçete malzemeleri</h2>
      {/* lg:grid-cols-2: geniş terminalde (lg:max-w-5xl) 12 malzeme tek kolonda alt alta dizilip
          sayfayı gereksiz uzatıyordu (Tur 3 bulgusu, P1) — 1024px+ ekranda 2 kolon. */}
      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-x-3 lg:space-y-0 lg:[&>*]:mb-2">
        {real.map((m) => {
          const planned = new Decimal(m.m.plannedQty);
          const consumed = new Decimal(m.m.consumedQty);
          const pct = planned.gt(0) ? Math.min(100, consumed.div(planned).mul(100).toNumber()) : 0;
          const done = consumed.gte(planned);
          return (
            <div key={m.m.id} className="rounded-lg border border-border/60 bg-card p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className={cn('truncate', done && 'text-success')}>{m.productName}</span>
                {/* tr-TR ayracı + tabular-nums: eskiden toFixed(2) İngilizce nokta basıyordu ("8.40 /
                    21.00 KG") — aynı ekranda "Son tüketimler" bloğu (QtyCell) "8,4 KG" gösteriyordu,
                    tek ekranda iki sayı sistemi (Tur 3 bulgusu, P0). */}
                <span className="shrink-0 text-xs text-muted-foreground">
                  <QtyCell value={m.m.consumedQty} maxDigits={3} className="inline-flex" /> / <QtyCell value={m.m.plannedQty} uom={m.uomCode ?? uomFallback} maxDigits={3} className="inline-flex" />
                </span>
              </div>
              {/* pct===0'da çubuk hiç render edilmez: opacity-60 düz gri bir çizgi bırakıyordu, 11
                  malzemede aynı anlamsız çizgi ekranı dolduruyordu (Tur 3 bulgusu, P2). */}
              {pct > 0 ? <Progress value={pct} className={cn('h-1.5', done && '[&>div]:bg-success')} /> : <div className="h-px w-full border-t border-dashed border-border/50" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarcodeInput({ workOrderId, disabled, onFefoWarning, onSuccess }: { workOrderId: string; disabled?: boolean; onFefoWarning: (code: string, expectedLotNo: string | null) => void; onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function submit() {
    const c = code.trim();
    if (!c) return;
    startTransition(async () => {
      const res = await scanConsumeAction({ workOrderId, code: c });
      setCode('');
      ref.current?.focus();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data.fefoWarning) {
        onFefoWarning(c, res.data.expectedLotNo ?? null);
        return;
      }
      toast.success(res.data.consumption ? `${res.data.consumption.qty} tüketildi` : 'Malzeme okutuldu');
      onSuccess();
    });
  }

  return (
    <div className="relative">
      <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder="Lot / barkod okutun, Enter'a basın…"
        disabled={disabled || pending}
        className="h-14 pl-10 text-base font-mono"
        autoComplete="off"
      />
      {pending ? <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

function FefoDialog({ warning, workOrderId, onClose, onResolved }: { warning: { code: string; expectedLotNo: string | null } | null; workOrderId: string; onClose: () => void; onResolved: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={Boolean(warning)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning">
              <AlertTriangle className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base">FEFO sırası dışı lot</DialogTitle>
              <DialogDescription>
                Bu lot sırada değil{warning?.expectedLotNo ? ` — önce ${warning.expectedLotNo} kullanılmalı` : ''}. Yine de kullanmak için gerekçe onaylayın.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-12" onClick={onClose} disabled={pending}>Vazgeç</Button>
          <Button
            variant="destructive"
            className="h-12"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!warning) return;
                const res = await scanConsumeAction({ workOrderId, code: warning.code, forceOverride: true });
                if (res.ok && !res.data.fefoWarning) {
                  toast.success('Lot yine de kullanıldı');
                  onClose();
                  onResolved();
                } else {
                  toast.error(!res.ok ? res.error : 'İşlem başarısız');
                }
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Yine de kullan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PauseDialog({ workOrderId, open, onOpenChange, onDone }: { workOrderId: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [reason, setReason] = useState('machine_failure');
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Duraklatma sebebi</DialogTitle>
        </DialogHeader>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(DOWNTIME_REASON_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value} className="h-11 text-base">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={pending}>Vazgeç</Button>
          <Button
            className="h-12"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await pauseWorkOrderAction({ id: workOrderId, reason });
                if (res.ok) { toast.success('Duraklatıldı'); onOpenChange(false); onDone(); } else toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Duraklat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScrapDialog({ workOrderId, uomCode, open, onOpenChange, onDone }: { workOrderId: string; uomCode: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [qty, setQty] = useState<string | null>(null);
  const [reason, setReason] = useState('spill');
  const [stage, setStage] = useState('proses');
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) setQty(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fire gir</DialogTitle>
          <DialogDescription>Miktar, sebep ve aşama girin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Miktar</label>
            <NumberInput value={qty} onChange={setQty} suffix={uomCode} maxDigits={3} className="[&_input]:h-14 [&_input]:text-lg" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Sebep</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SCRAP_REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="h-11 text-base">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Aşama</label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-12 w-full text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SCRAP_STAGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="h-11 text-base">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={pending}>Vazgeç</Button>
          <Button
            variant="destructive"
            className="h-12"
            disabled={pending || !qty || Number(qty) <= 0}
            onClick={() =>
              startTransition(async () => {
                if (!qty) return;
                const res = await recordScrapAction({ workOrderId, qty, reason: reason as 'spill' | 'burnt' | 'contamination' | 'packaging' | 'startup' | 'other', stage: stage as 'hammadde' | 'proses' | 'ambalaj' });
                if (res.ok) { toast.success('Fire kaydedildi'); onOpenChange(false); onDone(); } else toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({ workOrderId, uomCode, remainingPlannedQty, open, onOpenChange, onDone }: { workOrderId: string; uomCode: string; remainingPlannedQty: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [qty, setQty] = useState<string | null>(remainingPlannedQty);
  const [autoConsume, setAutoConsume] = useState(true);
  const [pending, startTransition] = useTransition();
  const [autoPending, startAutoTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) setQty(remainingPlannedQty); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>İş emrini bitir</DialogTitle>
          <DialogDescription>Üretilen miktarı girin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Üretilen miktar</label>
            <NumberInput value={qty} onChange={setQty} suffix={uomCode} maxDigits={3} className="[&_input]:h-14 [&_input]:text-lg" />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={autoConsume} onChange={(e) => setAutoConsume(e.target.checked)} className="size-5 rounded border-input" />
            Reçeteye göre kalan malzemeyi otomatik tüket
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            disabled={autoPending}
            onClick={() =>
              startAutoTransition(async () => {
                const res = await autoConsumeRemainingAction({ id: workOrderId });
                if (res.ok) toast.success(`${res.data.count} satır otomatik tüketildi`);
                else toast.error(res.error);
              })
            }
          >
            {autoPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Şimdi reçeteye göre tamamla
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={pending}>Vazgeç</Button>
          <Button
            className="h-12"
            disabled={pending || !qty || Number(qty) <= 0}
            onClick={() =>
              startTransition(async () => {
                if (!qty) return;
                const res = await finishWorkOrderAction({ workOrderId, producedQty: qty, autoConsumeRemainingMaterials: autoConsume });
                if (res.ok) {
                  toast.success(`İş emri bitti${res.data.lotNo ? ` — lot ${res.data.lotNo}` : ''}`);
                  onOpenChange(false);
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Bitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

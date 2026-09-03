'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PlayCircle, Send, PauseCircle, CheckCircle2, Lock, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumberInput } from '@/components/form/number-input';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DOWNTIME_REASON_LABELS } from '../labels';
import { releaseWorkOrderAction, startWorkOrderAction, pauseWorkOrderAction, resumeWorkOrderAction, cancelWorkOrderAction, finishWorkOrderAction, closeWorkOrderAction } from '../actions';

export type Perms = { plan: boolean; operate: boolean; close: boolean };

/** İş emri detay sayfası başlık aksiyonları — masaüstü. Operatör terminali kendi bileşenini kullanır. */
export function WorkOrderActions({ id, status, remainingPlannedQty, uomCode, perms }: { id: string; status: string; remainingPlannedQty: string; uomCode: string; perms: Perms }) {
  const [pending, startTransition] = useTransition();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error);
    });
  };

  const buttons: React.ReactNode[] = [];

  if (status === 'planned' && perms.plan) {
    buttons.push(
      <Button key="release" onClick={() => run(() => releaseWorkOrderAction({ id }), 'İş emri serbest bırakıldı')} disabled={pending}>
        <Send className="size-4" /> Serbest bırak
      </Button>,
    );
  }
  if ((status === 'planned' || status === 'released') && perms.plan) {
    buttons.push(
      <ConfirmDialog
        key="cancel"
        trigger={<Button variant="outline" disabled={pending}><XCircle className="size-4" /> İptal et</Button>}
        title="İş emrini iptal et"
        description="Bu iş emri iptal edilecek. Henüz tüketim/çıktı yoksa geri alınabilir."
        destructive
        confirmLabel="İptal et"
        onConfirm={() => cancelWorkOrderAction({ id })}
      />,
    );
  }
  if ((status === 'released' || status === 'planned') && perms.operate) {
    buttons.push(
      <Button key="start" onClick={() => run(() => startWorkOrderAction({ id }), 'İş emri başlatıldı')} disabled={pending}>
        <PlayCircle className="size-4" /> Başlat
      </Button>,
    );
  }
  if (status === 'in_progress' && perms.operate) {
    buttons.push(
      <Button key="pause" variant="outline" onClick={() => setPauseOpen(true)} disabled={pending}>
        <PauseCircle className="size-4" /> Duraklat
      </Button>,
    );
    buttons.push(
      <Button key="finish" onClick={() => setFinishOpen(true)} disabled={pending}>
        <CheckCircle2 className="size-4" /> Bitir
      </Button>,
    );
  }
  if (status === 'paused' && perms.operate) {
    buttons.push(
      <Button key="resume" onClick={() => run(() => resumeWorkOrderAction({ id }), 'İş emri devam ediyor')} disabled={pending}>
        <PlayCircle className="size-4" /> Devam et
      </Button>,
    );
    buttons.push(
      <Button key="finish" onClick={() => setFinishOpen(true)} disabled={pending}>
        <CheckCircle2 className="size-4" /> Bitir
      </Button>,
    );
  }
  if (status === 'finished' && perms.close) {
    buttons.push(
      <ConfirmDialog
        key="close"
        trigger={<Button disabled={pending}><Lock className="size-4" /> Kapat</Button>}
        title="İş emrini kapat"
        description="Maliyet kilitlenecek; kapatıldıktan sonra tüketim/çıktı eklenemez."
        confirmLabel="Kapat"
        onConfirm={() => closeWorkOrderAction({ id })}
      />,
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">{buttons}</div>
      <PauseDialog id={id} open={pauseOpen} onOpenChange={setPauseOpen} />
      <FinishDialog id={id} open={finishOpen} onOpenChange={setFinishOpen} remainingPlannedQty={remainingPlannedQty} uomCode={uomCode} />
    </>
  );
}

function PauseDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [reason, setReason] = useState('machine_failure');
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>İş emrini duraklat</DialogTitle>
          <DialogDescription>Duruş sebebi OEE hesaplamasına yansır.</DialogDescription>
        </DialogHeader>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(DOWNTIME_REASON_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Vazgeç</Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                const res = await pauseWorkOrderAction({ id, reason });
                if (res.ok) {
                  toast.success('İş emri duraklatıldı');
                  onOpenChange(false);
                } else toast.error(res.error);
              })
            }
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Duraklat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({ id, open, onOpenChange, remainingPlannedQty, uomCode }: { id: string; open: boolean; onOpenChange: (v: boolean) => void; remainingPlannedQty: string; uomCode: string }) {
  const [qty, setQty] = useState<string | null>(remainingPlannedQty);
  const [autoConsume, setAutoConsume] = useState(true);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) setQty(remainingPlannedQty); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>İş emrini bitir</DialogTitle>
          <DialogDescription>Üretilen miktarı girin; mamul lotu ve stok hareketi otomatik oluşur.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Üretilen miktar</label>
            <NumberInput value={qty} onChange={setQty} suffix={uomCode} maxDigits={3} />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={autoConsume} onChange={(e) => setAutoConsume(e.target.checked)} className="size-4 rounded border-input" />
            Reçeteye göre kalan malzemeyi otomatik tüket (FEFO)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Vazgeç</Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                if (!qty || Number(qty) <= 0) {
                  toast.error('Üretilen miktar sıfırdan büyük olmalı');
                  return;
                }
                const res = await finishWorkOrderAction({ workOrderId: id, producedQty: qty, autoConsumeRemainingMaterials: autoConsume });
                if (res.ok) {
                  toast.success(`İş emri bitti${res.data.lotNo ? ` — lot ${res.data.lotNo}` : ''}`);
                  onOpenChange(false);
                } else toast.error(res.error);
              })
            }
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Bitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

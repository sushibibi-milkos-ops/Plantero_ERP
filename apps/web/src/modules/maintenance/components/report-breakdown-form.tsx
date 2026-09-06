'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera, Loader2, ScanLine, Trash2, Wrench, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Form, FormText, FormTextarea, FormSelect } from '@/components/form/fields';
import { Combobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';
import { findMachineByScanAction, listWorkOrderOptionsAction, reportBreakdownAction } from '../actions';

const schema = z.object({
  machineId: z.string().uuid('Makine seçin'),
  title: z.string().trim().min(1, 'Başlık gerekli'),
  description: z.string().trim().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  workOrderId: z.string().uuid().optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'critical', label: 'Kritik — üretim durdu' },
];

type Photo = { fileName: string; mimeType: string; dataUrl: string };
type ScannedMachine = { id: string; code: string; name: string; status: string; lineId: string | null };
export type MachineFormOption = { id: string; code: string; name: string; category: string; lineId: string | null; status: string };

export function ReportBreakdownForm({ machines }: { machines: MachineFormOption[] }) {
  const router = useRouter();
  const [scanCode, setScanCode] = useState('');
  const [scanning, startScan] = useTransition();
  const [scanned, setScanned] = useState<ScannedMachine | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [workOrderOptions, setWorkOrderOptions] = useState<Array<{ id: string; docNo: string; productName: string }>>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { machineId: '', title: '', description: '', priority: 'normal', workOrderId: null },
  });

  const machineOptions = machines.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }));

  async function applyMachine(machine: ScannedMachine) {
    setScanned(machine);
    form.setValue('machineId', machine.id, { shouldValidate: true });
    form.setValue('workOrderId', null);
    const res = await listWorkOrderOptionsAction({ lineId: machine.lineId });
    setWorkOrderOptions(res.ok ? res.data : []);
  }

  function onScan() {
    const code = scanCode.trim();
    if (!code) return;
    startScan(async () => {
      const res = await findMachineByScanAction({ code });
      setScanCode('');
      scanInputRef.current?.focus();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await applyMachine(res.data);
    });
  }

  function onManualSelect(id: string | null) {
    if (!id) return;
    const m = machines.find((x) => x.id === id);
    if (!m) return;
    void applyMachine({ id: m.id, code: m.code, name: m.name, status: m.status, lineId: null });
  }

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (photos.length + files.length > 6) {
      toast.error('En fazla 6 fotoğraf eklenebilir');
      return;
    }
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev, { fileName: file.name, mimeType: file.type || 'image/jpeg', dataUrl: String(reader.result ?? '') }]);
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onSubmit(values: FormValues) {
    const res = await reportBreakdownAction({ ...values, photos });
    if (res.ok) {
      toast.success(`Arıza bildirildi: ${res.data.docNo}`);
      router.push(`/bakim/is-emirleri/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-xl space-y-5 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-0">
        {!scanned ? (
          <div className="space-y-3">
            <div className="relative">
              <ScanLine className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanInputRef}
                autoFocus
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onScan(); } }}
                placeholder="Makine QR'ı okutun (MCH:MK-008)…"
                disabled={scanning}
                className="h-14 pl-11 text-[15px] font-mono"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> veya listeden seçin <div className="h-px flex-1 bg-border" />
            </div>
            <Combobox value={null} onChange={onManualSelect} options={machineOptions} placeholder="Makine ara ve seç…" clearable={false} />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Wrench className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{scanned.code}</span>
                <StatusBadge status={scanned.status} kind="machine" />
              </div>
              <div className="truncate text-sm text-muted-foreground">{scanned.name}</div>
            </div>
            {/* Kriter 9 (Tur 1 P1 bakim-yeni-01) kök neden düzeltmesi: `size="icon"` (36×36px) sahada
                telefonla kullanılan bu ekranda 44px eşiğinin altındaydı. Bir `::before` hit-slop
                denemesi ölçüm aracının (`scripts/measure.ts`) gerçek testiyle UYUŞMUYOR — `getBounding
                ClientRect()` yalnızca ELEMANIN KENDİ kutusunu okur, `::before` ile görünmez şekilde
                genişletilen alanı SAYMAZ (gerçek dokunuşta çalışsa da otomatik ölçüm hâlâ 36×36
                raporlar). Kök neden düzeltmesi: düğmenin GERÇEK kutusu 44×44 (`size-11`, `icon`
                varyantının `size-9`'unu ezer) — ikon boyutu (16px) sabit kalır, yalnızca tıklanabilir
                alan büyür. */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => { setScanned(null); form.setValue('machineId', ''); }}
              aria-label="Makineyi değiştir"
              className="size-11"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
        {form.formState.errors.machineId && !scanned ? <p className="text-xs text-destructive">{form.formState.errors.machineId.message}</p> : null}

        {scanned ? (
          <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
            <FormText control={form.control} name="title" label="Başlık" required placeholder="Ör. Dolum başlığı sızdırıyor" />
            <FormTextarea control={form.control} name="description" label="Açıklama" placeholder="Ne zaman başladı, nasıl fark edildi…" rows={3} />
            <FormSelect control={form.control} name="priority" label="Öncelik" required options={PRIORITY_OPTIONS} />
            {workOrderOptions.length > 0 ? (
              <Controller
                control={form.control}
                name="workOrderId"
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium">Üretim iş emri (opsiyonel)</label>
                    <Combobox
                      value={field.value ?? null}
                      onChange={field.onChange}
                      options={workOrderOptions.map((w) => ({ value: w.id, label: `${w.docNo} — ${w.productName}` }))}
                      placeholder="Arıza bir iş emri sırasında mı fark edildi?"
                    />
                  </div>
                )}
              />
            ) : null}

            <div className="space-y-2">
              <label className="text-[13px] font-medium">Fotoğraf ({photos.length}/6)</label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted">
                    <Image src={p.dataUrl} alt={p.fileName} fill unoptimized className="object-cover" />
                    {/* Kriter 9 (Tur 1 P1 bakim-yeni-01) kök neden düzeltmesi: görsel rozet 24×24px
                        (`size-6`) — sahada iki fotoğraf eklendikten sonra ölçülen 44px eşiğinin çok
                        altında. `::before` hit-slop yerine (yukarıdaki not — ölçüm aracı pseudo-
                        elemanı saymıyor) TIKLANABİLİR eleman gerçekten 44×44 (`size-11`) yapılır;
                        siyah daire rozet GÖRSEL olarak 24px kalır — iç içe bir `<span>`'a taşındı,
                        dış `<button>` yalnızca görünmez bir dokunma kutusu. */}
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0 right-0 grid size-11 place-items-center text-white"
                      aria-label="Fotoğrafı kaldır"
                    >
                      <span className="grid size-6 place-items-center rounded-full bg-black/60">
                        <Trash2 className="size-3.5" />
                      </span>
                    </button>
                  </div>
                ))}
                {photos.length < 6 ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn('flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground', 'hover:border-primary/50 hover:text-primary')}
                  >
                    <Camera className="size-5" />
                    <span className="text-[11px]">Ekle</span>
                  </button>
                ) : null}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPickPhotos} />
            </div>
          </div>
        ) : null}

        <FormActions submitLabel="Arızayı bildir" onCancel={() => router.back()} pending={form.formState.isSubmitting} disabled={!scanned}>
          {scanning ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </FormActions>
      </form>
    </Form>
  );
}

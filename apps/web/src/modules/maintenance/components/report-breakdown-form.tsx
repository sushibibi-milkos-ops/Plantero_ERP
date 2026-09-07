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
      {/* Kök neden (Tur 5 P1 bakim-yeni-04): `mx-auto` masaüstünde de aktifti — form kendi `max-w-xl`
          kutusunu SAYFANIN ORTASINA değil ana sütunun ortasına alıyordu, bu da h1'in (264px) 274px
          sağına düşüyordu (modülün diğer route'larında içerik de h1 gibi 264px'ten başlar). `lg:mx-0`
          masaüstünde ortalamayı iptal eder — form artık ana sütunun (dolayısıyla h1'in) sol kenarına
          yaslanır; telefon/tablet (`<lg`) davranışı DEĞİŞMEDİ (tek sütun, ortalı kalır).

          Kök neden (Tur 6 P1 bakim-yeni-04): form ayrıca kendi `pb-[9rem]`ini (144px) taşıyordu —
          `FormActions` zaten `sticky bottom-16` (akışta kendi yerini kaplıyor, app-shell'in alt
          gezinmesinin 64px üstünde asılı durmuyor) ve app-shell'in `<main>`i zaten `pb-32` (128px,
          FormActions'ın sticky payı + MobileNav yüksekliği için) bırakıyor. İki payın üst üste
          binmesi son alandan sonra 338px ölü kaydırma ve eylem çubuğunun ekranın ortasında asılı
          kalmasına yol açıyordu. Form artık yalnızca gerçek donanım güvenli alanını (çentik/ev
          çubuğu) bırakır — düzen boşluğu tamamen app-shell'e/FormActions'a devredilir. */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-xl space-y-5 pb-[env(safe-area-inset-bottom)] lg:mx-0">
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

        {/* Kök neden (Tur 5 P1 bakim-yeni-02): bu kart eskiden yalnızca `scanned` (makine seçili)
            İKEN görünüyordu — makine seçilmeden önce sayfa yalnızca QR/combobox'tan ibaret kalıyor,
            "Vazgeç" düğmesi 337px'te bitiyor, geri kalan viewport (`min-h-dvh` — app-shell genel
            kuralı) boş kalıyordu. 2. adım alanları (başlık/açıklama/öncelik/fotoğraf) artık İLK
            EKRANDA, makine seçiminden BAĞIMSIZ görünür — kullanıcı arızayı makineyi bulmadan önce de
            yazabilir, gönderim yine de `machineId` seçilene kadar devre dışı kalır (`FormActions
            disabled={!scanned}` aşağıda değişmedi). */}
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

        {/* `-mb-12 md:mb-0` (yalnızca mobil): `position: sticky` bir öğe akışta HER ZAMAN kendi
            DOĞAL (offset uygulanmamış) konumunun yüksekliğini rezerve eder — ekranda gösterilen
            "yapışmış" konum yalnızca bir görsel kaydırma (clamp/offset), belge yüksekliği bu doğal
            konumu kullanır. Bu form kısa olduğu ve `FormActions` formun SON çocuğu olduğu için doğal
            konum, istenen `bottom-16` eşiğinin (viewport altından 64px) ötesine geçiyor — belge
            yalnızca GÖRSEL OLARAK HİÇBİR ZAMAN ERİŞİLEMEYEN ~50px'lik fazladan kaydırma alanı
            rezerve ediyor (Tur 6 P1 bakim-yeni-04, `scripts/probe-bakim-r6b.ts` `deadTail`). Negatif
            alt kenar boşluğu yalnızca bu erişilemez rezervi iptal eder — çubuğun gerçek (yapışmış)
            render konumunu DEĞİŞTİRMEZ (kenar boşluğu kutu modeli hesabıdır, `sticky`'nin ofset
            dönüşümünden bağımsızdır); masaüstünde (`md:static`, rezerv sorunu yok) sıfırlanır. */}
        <FormActions submitLabel="Arızayı bildir" onCancel={() => router.back()} pending={form.formState.isSubmitting} disabled={!scanned} className="-mb-12 md:mb-0">
          {scanning ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </FormActions>
      </form>
    </Form>
  );
}

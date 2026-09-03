'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, Lock, ArrowRight, ChevronRight, AlertTriangle, CheckCircle2, Loader2, RotateCcw, PlusCircle, PencilLine, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/empty-state';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { previewImportAction, applyImportAction, type ImportPreview } from '../actions';
import type { ImportHistoryRow } from '../queries';

type Step = 'select' | 'preview' | 'done';
type ApplyResult = { created: number; updated: number; unchanged: number; conflicts: unknown[] };

/** `packages/db/src/import/anaveri.ts`'in beklediği "Ana Veri" sayfası başlıkları — şablonla birebir aynı olmalı. */
const EXPECTED_COLUMNS: { name: string; example: string }[] = [
  { name: 'SKU', example: '110010001' },
  { name: 'Kısa Kod', example: 'PLT-BDM-1' },
  { name: 'Ürün Adı', example: 'Badem Bazı 1L' },
  { name: 'Kategori 1 / 2 / 3', example: 'Bitkisel Süt Konsantreleri → Badem' },
  { name: 'Ambalaj / Adet', example: '1 Adet' },
  { name: 'Barkod (EAN-13) / Koli Barkodu', example: '8683529780001' },
  { name: 'Durum', example: 'Aktif' },
  { name: 'Lokasyon', example: 'Tire/R01-A1' },
  { name: 'Miktar', example: '120' },
  { name: 'Eski SKU / Not', example: '(opsiyonel)' },
];

/** Ana Veri Excel içe aktarım sihirbazı: dosya → önizleme (diff: eski → yeni, korunacak alanlar kilitli) → uygula. */
export function ImportWizard({ history = [] }: { history?: ImportHistoryRow[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error('Yalnızca .xlsx dosyası kabul edilir');
      return;
    }
    setFile(f);
  }, []);

  async function runPreview() {
    if (!file) return;
    setPreviewing(true);
    const fd = new FormData();
    fd.set('file', file);
    const res = await previewImportAction(fd);
    setPreviewing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPreview(res.data);
    setStep('preview');
  }

  async function runApply() {
    if (!file) return;
    setApplying(true);
    const fd = new FormData();
    fd.set('file', file);
    const res = await applyImportAction(fd);
    setApplying(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res.data);
    setStep('done');
    toast.success(`İçe aktarım tamamlandı: ${res.data.created} yeni, ${res.data.updated} güncellendi`);
    router.refresh();
  }

  function reset() {
    setStep('select');
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-6">
      {step === 'select' ? (
        <div className="space-y-4">
          {/* Dashed border yalnızca gerçek bir bırakma hedefi için: kartın üst kısmı (sürükle/tıkla-seç).
              Alt kenardaki eylem şeridi dashed alanın DIŞINDA — oraya bir şey bırakılamaz, düz hairline. */}
          <div className={cn('overflow-hidden rounded-xl border-2 border-dashed transition-colors', dragOver ? 'border-primary bg-primary/5' : 'border-border/70')}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
              }}
              className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 px-6 py-10 text-center hover:bg-muted/30"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <FileSpreadsheet className="size-8 text-primary" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-[12px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB — hazır</p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-muted-foreground" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm font-medium">Excel dosyasını buraya sürükleyin</p>
                    <p className="text-[12px] text-muted-foreground">veya tıklayıp seçin — Plantero_AnaVeri_KonusanKod.xlsx formatı (&quot;Ana Veri&quot; + &quot;Kod Yapısı&quot; sayfaları)</p>
                  </div>
                </>
              )}
            </div>
            {/* Birincil eylem artık dropzone'un içinde, alt kenarında — devre dışı gerekçesi yanında yazılı. */}
            <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card px-4 py-3">
              <p className="min-w-0 truncate text-[12px] text-muted-foreground">
                {file ? 'Dosya seçildi — önizlemek için "Deneme çalıştır" ile devam edin.' : 'Önce bir .xlsx dosyası seçin.'}
              </p>
              <div className="flex shrink-0 gap-2">
                {file ? (
                  <Button variant="ghost" size="sm" className="max-md:h-11" onClick={reset} disabled={previewing}>
                    Vazgeç
                  </Button>
                ) : null}
                <Button size="sm" className="max-md:h-11" onClick={runPreview} disabled={!file || previewing}>
                  {previewing ? <Loader2 className="size-4 animate-spin" /> : null}
                  Deneme çalıştır (önizleme)
                </Button>
              </div>
            </div>
          </div>

          {/* Bağlam: önceki içe aktarımlar öne çıkar; hangi sütunlar bekleniyor sıkça bakılmayan bir
              referans — varsayılan kapalı <details>, açıldığında yoğun (h-9) satırlarla. */}
          <div className="space-y-4 border-t border-border/60 pt-4">
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
                <History className="size-3.5 text-muted-foreground" /> Son içe aktarımlar
              </h3>
              {history.length === 0 ? (
                <EmptyState compact icon={History} title="Henüz içe aktarım yapılmadı" description="İlk .xlsx dosyasını yükleyip deneme çalıştırın." />
              ) : (
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {history.map((h) => (
                    <li key={h.id} className="rounded-lg border border-border/70 bg-card px-3 py-2 text-[12px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-muted-foreground">{formatDateTime(h.at)}</span>
                        <span className="truncate text-muted-foreground">{h.userEmail ?? '—'}</span>
                      </div>
                      <p className="mt-0.5 truncate">{h.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <details className="group">
              {/* `list-none`: Chromium <summary>'nin yerel ▶ üçgenini (::marker, list-style tabanlı) siler
                  — `[&::-webkit-details-marker]:hidden` yalnızca eski WebKit'i hedefler, modern Chromium'da
                  etkisizdi ve ok hem yerel üçgeni hem de aşağıdaki ChevronRight'ı birlikte gösteriyordu
                  (Tur 3 P1 bulgusu). ChevronRight — aynı katlama simgesi location-tree.tsx'te kullanılan. */}
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] font-semibold text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
                Beklenen sütunlar — &quot;Ana Veri&quot; sayfası ({EXPECTED_COLUMNS.length})
                <ChevronRight className="size-3 transition-transform duration-150 ease-out group-open:rotate-90" />
              </summary>
              <div className="mt-2 border-t border-border/60">
                <table className="w-full border-collapse text-[12px]">
                  <tbody>
                    {EXPECTED_COLUMNS.map((c) => (
                      <tr key={c.name} className="h-9 border-b border-border/50 last:border-0">
                        <td className="w-1/2 px-3 font-medium">{c.name}</td>
                        <td className="px-3 text-muted-foreground">{c.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>
      ) : null}

      {step === 'preview' && preview ? <PreviewPanel preview={preview} onBack={reset} onApply={runApply} applying={applying} /> : null}

      {step === 'done' && result ? (
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 className="text-success" />
            <AlertTitle>İçe aktarım uygulandı</AlertTitle>
            <AlertDescription>
              {result.created} yeni ürün oluşturuldu, {result.updated} ürün güncellendi, {result.unchanged} ürün değişmedi
              {result.conflicts.length ? `, ${result.conflicts.length} alan korunarak atlandı` : ''}. Denetim kaydı düşüldü.
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="size-4" /> Yeni içe aktarım
            </Button>
            <Button asChild>
              <Link href="/ana-veri/urunler">Ürünlere git</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatChip({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    neutral: 'text-foreground',
    success: 'text-success',
    warning: 'text-[oklch(0.5_0.14_70)] dark:text-warning',
    danger: 'text-destructive',
  }[tone];
  return (
    <div className="flex-1 rounded-lg border border-border/60 px-4 py-3">
      <div className={cn('font-mono text-2xl font-semibold tabular-nums', toneClass)}>{value}</div>
      <div className="mt-0.5 text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

function PreviewPanel({ preview, onBack, onApply, applying }: { preview: ImportPreview; onBack: () => void; onApply: () => void; applying: boolean }) {
  const { diff, warnings } = preview;
  const totalChanges = diff.createdRows.length + diff.changedRows.length;

  return (
    <div className="space-y-6">
      {warnings.length ? (
        <Alert className="border-warning/40 bg-warning/5">
          <AlertTriangle className="text-[oklch(0.5_0.14_70)] dark:text-warning" />
          <AlertTitle className="text-foreground">{warnings.length} uyarı</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-muted-foreground">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <StatChip label="Yeni" value={diff.createdRows.length} tone="success" />
        <StatChip label="Değişen" value={diff.changedRows.length} tone="warning" />
        <StatChip label="Değişmeyen" value={diff.unchangedCount} />
        <StatChip label="Çakışma (korunacak)" value={diff.conflicts.length} tone={diff.conflicts.length ? 'danger' : 'neutral'} />
      </div>

      {diff.createdRows.length ? (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <PlusCircle className="size-4 text-success" /> Yeni ürünler ({diff.createdRows.length})
          </h3>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border/70">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="h-9 border-b border-border/60 bg-muted/40 text-[11px] text-muted-foreground uppercase">
                    <th className="px-3 text-left font-medium">SKU</th>
                    <th className="px-3 text-left font-medium">Ürün Adı</th>
                    <th className="px-3 text-left font-medium">Tip</th>
                    <th className="px-3 text-left font-medium">Kategori</th>
                    <th className="px-3 text-left font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Lock className="size-3" /> Barkod
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {diff.createdRows.map((r) => (
                    <tr key={r.sku} className="h-9 border-b border-border/40 last:border-0 hover:bg-muted/20">
                      <td className="px-3 font-mono text-[12px]">{r.sku}</td>
                      <td className="px-3 font-medium">{r.name}</td>
                      <td className="px-3 text-muted-foreground">{r.fields.find((f) => f.key === 'type')?.after}</td>
                      <td className="px-3 text-muted-foreground">{r.fields.find((f) => f.key === 'category')?.after}</td>
                      <td className="px-3 font-mono text-[12px] text-muted-foreground">{r.fields.find((f) => f.key === 'barcode')?.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {diff.changedRows.length ? (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <PencilLine className="size-4 text-[oklch(0.5_0.14_70)] dark:text-warning" /> Değişen alanlar ({diff.changedRows.length})
          </h3>
          <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-muted/10 p-2">
            {diff.changedRows.map((r) => (
              <div key={r.sku} className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[12px] text-muted-foreground">{r.sku}</span>
                  <span className="text-[13px] font-medium">{r.name}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.fields.map((f) => (
                    <span key={f.key} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px]">
                      <span className="text-muted-foreground">{f.label}:</span>
                      <span className="font-mono">{f.before}</span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <span className="font-mono font-medium text-foreground">{f.after}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {diff.conflicts.length ? (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Lock className="size-4 text-destructive" /> Çakışmalar — korunacak alanlar ({diff.conflicts.length})
          </h3>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Ürün adı ve barkod oluşturulduktan sonra kilitlenir. Excel&apos;deki değer DB&apos;dekinden farklıysa DB&apos;deki değer korunur, üzerine yazılmaz.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="h-9 border-b border-border/60 bg-muted/40 text-[11px] text-muted-foreground uppercase">
                  <th className="px-3 text-left font-medium">SKU</th>
                  <th className="px-3 text-left font-medium">Alan</th>
                  <th className="px-3 text-left font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3" /> Mevcut (korunacak)
                    </span>
                  </th>
                  <th className="px-3 text-left font-medium">Excel&apos;deki (yok sayıldı)</th>
                </tr>
              </thead>
              <tbody>
                {diff.conflicts.map((c, i) => (
                  <tr key={`${c.sku}-${c.field}-${i}`} className="h-9 border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-3 font-mono text-[12px]">{c.sku}</td>
                    <td className="px-3">
                      <Badge variant="outline">{c.label}</Badge>
                    </td>
                    <td className="px-3 font-mono text-[12px] font-medium">{c.existing ?? '—'}</td>
                    <td className="px-3 font-mono text-[12px] text-muted-foreground line-through decoration-muted-foreground/50">{c.incoming ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {totalChanges === 0 && !diff.conflicts.length ? (
        <EmptyState icon={CheckCircle2} title="Değişiklik yok" description="Bu dosya daha önce içe aktarılmış — tüm satırlar zaten güncel (0 değişiklik)." compact />
      ) : null}

      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <p className="text-[12px] text-muted-foreground">Bu bir deneme çalıştırmasıydı — henüz hiçbir şey yazılmadı.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack} disabled={applying}>
            Geri
          </Button>
          <Button onClick={onApply} disabled={applying || (totalChanges === 0 && diff.conflicts.length === 0)}>
            {applying ? <Loader2 className="size-4 animate-spin" /> : null}
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}

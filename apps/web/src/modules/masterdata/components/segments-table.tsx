'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Lock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormSelect, FormCheckbox } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { Badge } from '@/components/ui/badge';
import type { SkuSegmentOption } from './product-wizard';
import { addSkuSegmentAction } from '../actions';
import { PRODUCT_TYPE_LABELS } from '../product-labels';

const SEGMENT_LABELS: Record<string, string> = {
  T: 'T — Ürün/Kayıt Tipi (1 hane)',
  AA: 'AA — Aile / Hammadde Grubu (2 hane)',
  BB: 'BB — Bileşen / Alt Kategori (2 hane)',
  CC: 'CC — Varyant (2 hane)',
  PP: 'PP — Ambalaj / Adet (2 hane)',
};

const schema = z.object({
  segment: z.enum(['T', 'AA', 'BB', 'CC', 'PP']),
  context: z.string().trim().optional().nullable(),
  code: z.string().trim().min(1, 'Kod gerekli'),
  label: z.string().trim().min(1, 'Etiket gerekli'),
  isReserved: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

/** Sayfa başlığında (PageHeader actions) kullanılan bağımsız "Kod ekle" tetikleyicisi. */
export function AddSegmentButton({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { segment: 'BB', context: '', code: '', label: '', isReserved: false } });

  async function onSubmit(values: FormValues) {
    const res = await addSkuSegmentAction({ ...values, context: values.context || null });
    if (res.ok) {
      toast.success('Kod eklendi');
      setOpen(false);
      form.reset({ segment: values.segment, context: '', code: '', label: '', isReserved: false });
    } else toast.error(res.error);
  }

  if (!canManage) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} className="max-md:h-11">
        <Plus className="size-4" /> Kod ekle
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Segment sözlüğüne kod ekle</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormSelect
              control={form.control}
              name="segment"
              label="Segment"
              options={['T', 'AA', 'BB', 'CC', 'PP'].map((s) => ({ value: s, label: SEGMENT_LABELS[s] ?? s }))}
            />
            <FormText control={form.control} name="context" label="Bağlam (opsiyonel)" description="Ör. finished, raw_material, equipment — AA için tip bağlamı." />
            <FormText control={form.control} name="code" label="Kod" mono required />
            <FormText control={form.control} name="label" label="Etiket" required />
            <FormCheckbox control={form.control} name="isReserved" label="Rezerve (henüz kullanılmıyor)" />
            <DialogFooter>
              <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Ekle">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Vazgeç
                  </Button>
                </DialogClose>
              </FormActions>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Kod / Bağlam sütunları beş tabloda da aynı sabit genişlikte — "Etiket" hepsinde aynı x'te başlasın diye. */
const CODE_COL_WIDTH = 110;
const CONTEXT_COL_WIDTH = 120;

export function SegmentsTable({ segments }: { segments: SkuSegmentOption[] }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('tr-TR');

  const grouped = useMemo(() => {
    const g = new Map<string, SkuSegmentOption[]>();
    for (const s of segments) {
      const list = g.get(s.segment) ?? [];
      list.push(s);
      g.set(s.segment, list);
    }
    return g;
  }, [segments]);

  return (
    <div className="max-w-[1120px] space-y-6">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kod ya da etiket ara…"
          className="h-9 w-full rounded-md border border-border/60 bg-background pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-xs"
        />
      </div>

      {/* Kök neden (Tur 3 P0): satırları hizalayan bir grid'de en uzun sütun (T, ~6 satır) diğer sütunun
          (BB, ~20 satır) başlama y'sini belirliyordu — 1380px'e varan boş dikey alan. CSS çoklu sütun
          (masonry benzeri): her blok kendi yüksekliğine göre akar, kısa bloklar boşluk bırakmaz.
          `break-inside-avoid`: bir segment bloğu (başlık+tablo) sütun sınırında ikiye bölünmez. */}
      <div className="columns-1 gap-6 lg:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
        {(['T', 'AA', 'BB', 'CC', 'PP'] as const).map((seg) => {
          const all = (grouped.get(seg) ?? []).slice().sort((a, b) => (a.context ?? '').localeCompare(b.context ?? '') || a.code.localeCompare(b.code));
          const rows = needle ? all.filter((r) => r.code.toLocaleLowerCase('tr-TR').includes(needle) || r.label.toLocaleLowerCase('tr-TR').includes(needle)) : all;
          // Tümü '—' olan "Bağlam" ya da tümü boş olan "Rezerve" sütunları bu bölümde render edilmez —
          // başlığı olup tek bir değeri olmayan bir sütun anlamsız gürültüdür.
          const hasContext = all.some((r) => r.context);
          const hasReserved = all.some((r) => r.isReserved);
          return (
            <div key={seg}>
              <h2 className="mb-2 text-sm font-semibold">{SEGMENT_LABELS[seg]}</h2>
              {all.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Sözlükte kayıt yok.</p>
              ) : rows.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Aramayla eşleşen kayıt yok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                        <th className="h-9 px-3 text-left font-medium" style={{ width: CODE_COL_WIDTH }}>Kod</th>
                        {hasContext ? <th className="h-9 px-3 text-left font-medium" style={{ width: CONTEXT_COL_WIDTH }}>Bağlam</th> : null}
                        <th className="h-9 px-3 text-left font-medium">Etiket</th>
                        {hasReserved ? <th className="h-9 px-3 text-center font-medium">Rezerve</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={`${r.segment}-${r.context}-${r.code}`} className="h-9 border-b border-border/50 last:border-0 hover:bg-accent/50">
                          <td className="px-3 font-mono text-[12px] whitespace-nowrap">{r.code}</td>
                          {hasContext ? (
                            <td className="px-3 whitespace-nowrap text-muted-foreground">{r.context ? (PRODUCT_TYPE_LABELS[r.context] ?? r.context) : '—'}</td>
                          ) : null}
                          <td className="px-3">{r.label}</td>
                          {hasReserved ? (
                            <td className="px-3 text-center">
                              {r.isReserved ? (
                                <Badge variant="secondary" className="gap-1">
                                  <Lock className="size-3" /> Rezerve
                                </Badge>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-[13px] text-muted-foreground">
        <h3 className="mb-1 font-medium text-foreground">Kurallar</h3>
        <ul className="list-disc space-y-1 pl-4">
          <li>SKU 9 hane: T(1) · AA(2) · BB(2) · CC(2) · PP(2).</li>
          <li>T: 1 mamul, 2 yarı mamul (rezerve), 3 hammadde, 4 ambalaj (rezerve), 8 teknik ekipman, 9 demirbaş.</li>
          <li>Ürün adı ve barkod Excel&apos;den geldiği gibi kalır — asla normalize edilmez.</li>
          <li>Ürün oluşturulduktan sonra ad ve barkod kilitlenir; değiştirmek için admin.settings izni ve gerekçe gerekir.</li>
          <li>Aynı T·AA·BB·CC altında sıradaki boş PP kodu ürün sihirbazında otomatik önerilir.</li>
        </ul>
      </div>
    </div>
  );
}

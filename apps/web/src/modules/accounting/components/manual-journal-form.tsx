'use client';

import { useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormText, FormSelect } from '@/components/form/fields';
import { FormMoney } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { FormCombobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { D, sum, round4 } from '@plantero/core/money';
import { createManualJournalEntryAction } from '../actions';

const lineSchema = z.object({ accountCode: z.string().min(1, 'Hesap seçin'), partnerId: z.string().optional().nullable(), description: z.string().trim().optional().nullable(), debit: z.string().optional(), credit: z.string().optional() });
const schema = z.object({
  ledger: z.enum(['VUK', 'UFRS', 'both']), journalCode: z.string().min(1, 'Yevmiye seçin'), entryDate: z.string().min(1, 'Tarih girin'),
  description: z.string().trim().min(3, 'Açıklama girin'), lines: z.array(lineSchema).min(2, 'En az iki satır olmalı'),
});
type FormValues = z.infer<typeof schema>;

const PARTNER_ROOTS = new Set(['120', '320']);

export function ManualJournalForm({
  journals,
  accounts,
  partners,
}: {
  journals: Array<{ id: string; code: string; name: string }>;
  accounts: Array<{ code: string; name: string; type: string; isPartnerAccount: boolean }>;
  partners: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ledger: 'both', journalCode: 'GEN', entryDate: new Date().toISOString().slice(0, 10), description: '', lines: [{ accountCode: '', debit: '', credit: '' }, { accountCode: '', debit: '', credit: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const lines = form.watch('lines');

  const journalOptions = useMemo(() => journals.map((j) => ({ value: j.code, label: `${j.code} — ${j.name}` })), [journals]);
  const accountOptions = useMemo(() => {
    const nonPartner = accounts.filter((a) => !a.isPartnerAccount).map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` }));
    return [{ value: '120', label: '120 — Alıcılar (cari seçilecek)' }, { value: '320', label: '320 — Satıcılar (cari seçilecek)' }, ...nonPartner];
  }, [accounts]);
  const partnerOptions = useMemo(() => partners.map((p) => ({ value: p.id, label: p.name, description: p.code })), [partners]);

  // KÖK NEDEN (kanıtlandı — tur 2 P1, ek bulgu): `useMemo(() => …, [lines])` — react-hook-form'un
  // `watch()`'u dizi/nesne yollarında YENİ bir referans DEĞİL, AYNI (mutasyona uğramış) referansı
  // döndürür (doğrulandı: art arda `form.watch('lines')` çağrıları arasında `Object.is` → true,
  // içerik farklı olsa bile). `useMemo`'nun bağımlılık karşılaştırması referans eşitliğine (Object.is)
  // dayandığından `[lines]` HİÇBİR ZAMAN "değişti" saymıyordu — `totals` ilk (boş) render'da hesaplanıp
  // sonsuza dek donuyordu. DOM'da (NumberInput'un kendi yerel `text` state'i sayesinde) doğru değer
  // görünse de, `balanced` hep `false` kalıyor, "Fişi kaydet" kalıcı olarak disabled kalıyordu.
  // Satır sayısı en fazla birkaç onlarca olduğundan memoizasyonun performans faydası da yok — düz
  // hesaplama (her render'da çalışır, her zaman GÜNCEL `lines` içeriğini okur) kök nedeni ortadan
  // kaldırır, "doğru bağımlılık" aramaktan daha güvenli.
  const totalDebit = round4(sum(lines.map((l) => D(l.debit || 0))));
  const totalCredit = round4(sum(lines.map((l) => D(l.credit || 0))));
  const totals = { debit: totalDebit, credit: totalCredit, diff: totalDebit.minus(totalCredit) };
  const balanced = totals.diff.isZero() && totals.debit.gt(0);

  async function onSubmit(values: FormValues) {
    if (!balanced) { toast.error('Fiş dengeli değil (borç ≠ alacak)'); return; }
    const res = await createManualJournalEntryAction(values);
    if (res.ok) {
      toast.success('Manuel fiş kaydedildi');
      router.push(res.data.vukId ? `/muhasebe/yevmiye/${res.data.vukId}` : '/muhasebe/yevmiye');
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        {/* max-w-3xl (tur 2 P1 muhasebe-tahsilat-yeni-01 ile aynı kök neden/desen): yalnızca başlık
            alanları sınırlanır, aşağıdaki "Satırlar" tablosu (6 sütun) tam genişlikte kalır. */}
        <div className="max-w-3xl space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormSelect control={form.control} name="ledger" label="Defter" required options={[{ value: 'both', label: 'VUK + UFRS (ikisi)' }, { value: 'VUK', label: 'Yalnızca VUK' }, { value: 'UFRS', label: 'Yalnızca UFRS' }]} />
            <FormSelect control={form.control} name="journalCode" label="Yevmiye" required options={journalOptions} />
            <FormDate control={form.control} name="entryDate" label="Tarih" required />
          </div>
          <FormText control={form.control} name="description" label="Açıklama" required />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">Satırlar</span>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ accountCode: '', debit: '', credit: '' })}>
              <Plus className="size-3.5" /> Satır ekle
            </Button>
          </div>
          {/* Masaüstünde tablo, mobilde tek kolona düşen kart listesi — 5 alan 375px'te yan yana sığmaz. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border/60 md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Hesap</th>
                  <th className="px-3 py-2 font-medium">Cari</th>
                  <th className="px-3 py-2 font-medium">Açıklama</th>
                  <th className="px-3 py-2 text-right font-medium">Borç</th>
                  <th className="px-3 py-2 text-right font-medium">Alacak</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => {
                  const needsPartner = PARTNER_ROOTS.has(lines[i]?.accountCode ?? '');
                  return (
                    <tr key={field.id} className="border-b border-border/40 last:border-0">
                      <td className="min-w-44 px-3 py-2"><FormCombobox control={form.control} name={`lines.${i}.accountCode`} options={accountOptions} placeholder="Hesap seçin…" searchPlaceholder="Ara…" /></td>
                      <td className="min-w-40 px-3 py-2">{needsPartner ? <FormCombobox control={form.control} name={`lines.${i}.partnerId`} options={partnerOptions} placeholder="Cari seçin…" searchPlaceholder="Ara…" /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="min-w-32 px-3 py-2"><FormText control={form.control} name={`lines.${i}.description`} placeholder="Opsiyonel…" /></td>
                      <td className="w-28 px-3 py-2"><FormMoney control={form.control} name={`lines.${i}.debit`} /></td>
                      <td className="w-28 px-3 py-2"><FormMoney control={form.control} name={`lines.${i}.credit`} /></td>
                      <td className="px-3 py-2">
                        <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 2 && remove(i)} disabled={fields.length <= 2} aria-label="Satırı sil">
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {fields.map((field, i) => {
              const needsPartner = PARTNER_ROOTS.has(lines[i]?.accountCode ?? '');
              return (
                <div key={field.id} className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-muted-foreground">Satır {i + 1}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 2 && remove(i)} disabled={fields.length <= 2} aria-label="Satırı sil" className="size-11">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <FormCombobox control={form.control} name={`lines.${i}.accountCode`} label="Hesap" options={accountOptions} placeholder="Hesap seçin…" searchPlaceholder="Ara…" />
                  {needsPartner ? <FormCombobox control={form.control} name={`lines.${i}.partnerId`} label="Cari" options={partnerOptions} placeholder="Cari seçin…" searchPlaceholder="Ara…" /> : null}
                  <FormText control={form.control} name={`lines.${i}.description`} label="Açıklama" placeholder="Opsiyonel…" />
                  <div className="grid grid-cols-2 gap-3">
                    <FormMoney control={form.control} name={`lines.${i}.debit`} label="Borç" />
                    <FormMoney control={form.control} name={`lines.${i}.credit`} label="Alacak" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-4 text-[13px]">
            <span className="text-muted-foreground">Borç: <span className="num tabular-nums text-foreground">{totals.debit.toFixed(4)}</span></span>
            <span className="text-muted-foreground">Alacak: <span className="num tabular-nums text-foreground">{totals.credit.toFixed(4)}</span></span>
            <span className={balanced ? 'font-medium text-success' : 'font-medium text-destructive'}>{balanced ? 'Dengeli' : `Fark: ${totals.diff.toFixed(4)}`}</span>
          </div>
        </div>

        <FormActions onCancel={() => router.back()} pending={form.formState.isSubmitting} disabled={!balanced} submitLabel="Fişi kaydet" />
      </form>
    </Form>
  );
}

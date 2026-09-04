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
// '@plantero/core' barrel sunucu-özel kod (bcrypt/node:crypto vb.) re-export eder — client
// bileşende yalnızca saf `money.ts` alt yolundan içe aktarılır (finans modülüyle aynı örüntü).
import { D, sum, round4, toDb } from '@plantero/core/money';
import { createExpenseInvoiceAction } from '../actions';
import type { ExpenseAccountOption } from '../queries';

const lineSchema = z.object({ description: z.string().trim().min(1, 'Açıklama girin'), accountCode: z.string().min(1, 'Hesap seçin'), amount: z.string().min(1, 'Tutar girin'), vatRate: z.string().min(1) });
const schema = z.object({
  partnerId: z.string().uuid('Tedarikçi seçin'),
  supplierInvoiceNo: z.string().trim().optional().nullable(),
  invoiceDate: z.string().min(1, 'Tarih girin'),
  note: z.string().trim().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'En az bir satır ekleyin'),
});
type FormValues = z.infer<typeof schema>;

const VAT_OPTIONS = [{ value: '0', label: 'KDV %0' }, { value: '1', label: 'KDV %1' }, { value: '10', label: 'KDV %10' }, { value: '20', label: 'KDV %20' }];

export function ExpenseInvoiceForm({ suppliers, expenseAccounts }: { suppliers: Array<{ id: string; code: string; name: string }>; expenseAccounts: ExpenseAccountOption[] }) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { partnerId: '', supplierInvoiceNo: '', invoiceDate: new Date().toISOString().slice(0, 10), note: '', lines: [{ description: '', accountCode: '', amount: '', vatRate: '20' }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const lines = form.watch('lines');

  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name, description: s.code })), [suppliers]);
  const accountOptions = useMemo(() => expenseAccounts.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` })), [expenseAccounts]);

  const totals = useMemo(() => {
    const subtotal = round4(sum(lines.map((l) => D(l.amount || 0))));
    const vat = round4(sum(lines.map((l) => D(l.amount || 0).mul(D(l.vatRate || 0)).div(100))));
    return { subtotal, vat, grand: subtotal.plus(vat) };
  }, [lines]);

  async function onSubmit(values: FormValues) {
    const res = await createExpenseInvoiceAction(values);
    if (res.ok) {
      toast.success(`Gider faturası kaydedildi: ${res.data.docNo}`);
      router.push(`/muhasebe/faturalar/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormCombobox control={form.control} name="partnerId" label="Tedarikçi" required options={supplierOptions} placeholder="Tedarikçi seçin…" searchPlaceholder="Ara…" />
          <FormText control={form.control} name="supplierInvoiceNo" label="Tedarikçi fatura no (opsiyonel)" />
          <FormDate control={form.control} name="invoiceDate" label="Fatura tarihi" required />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">Satırlar</span>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', accountCode: '', amount: '', vatRate: '20' })}>
              <Plus className="size-3.5" /> Satır ekle
            </Button>
          </div>
          {/* Masaüstünde tablo, mobilde tek kolona düşen kart listesi (Tur kuralı: "formlar tek kolona
              düşer") — 4 alan + sil düğmesi 375px'te yan yana asla sığmaz, önceden tabloyu yatay
              kaydırmaya zorluyordu. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border/60 md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Açıklama</th>
                  <th className="px-3 py-2 font-medium">Hesap</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="px-3 py-2 text-right font-medium">KDV</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => (
                  <tr key={field.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2"><FormText control={form.control} name={`lines.${i}.description`} placeholder="Eylül kirası…" /></td>
                    <td className="px-3 py-2 min-w-40"><FormCombobox control={form.control} name={`lines.${i}.accountCode`} options={accountOptions} placeholder="Hesap seçin…" searchPlaceholder="Ara…" /></td>
                    <td className="px-3 py-2 w-32"><FormMoney control={form.control} name={`lines.${i}.amount`} /></td>
                    <td className="px-3 py-2 w-28"><FormSelect control={form.control} name={`lines.${i}.vatRate`} options={VAT_OPTIONS} /></td>
                    <td className="px-3 py-2">
                      <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 1 && remove(i)} disabled={fields.length <= 1} aria-label="Satırı sil">
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {fields.map((field, i) => (
              <div key={field.id} className="space-y-3 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-muted-foreground">Satır {i + 1}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 1 && remove(i)} disabled={fields.length <= 1} aria-label="Satırı sil" className="size-11">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <FormText control={form.control} name={`lines.${i}.description`} label="Açıklama" placeholder="Eylül kirası…" />
                <FormCombobox control={form.control} name={`lines.${i}.accountCode`} label="Hesap" options={accountOptions} placeholder="Hesap seçin…" searchPlaceholder="Ara…" />
                <div className="grid grid-cols-2 gap-3">
                  <FormMoney control={form.control} name={`lines.${i}.amount`} label="Tutar" />
                  <FormSelect control={form.control} name={`lines.${i}.vatRate`} label="KDV" options={VAT_OPTIONS} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-4 text-[13px] text-muted-foreground">
            <span>Ara toplam: <span className="num tabular-nums text-foreground">{toDb(totals.subtotal)}</span></span>
            <span>KDV: <span className="num tabular-nums text-foreground">{toDb(totals.vat)}</span></span>
            <span className="font-medium">Genel toplam: <span className="num tabular-nums text-foreground">{toDb(totals.grand)}</span></span>
          </div>
        </div>

        <FormActions onCancel={() => router.back()} pending={form.formState.isSubmitting} submitLabel="Gider faturasını kaydet" />
      </form>
    </Form>
  );
}

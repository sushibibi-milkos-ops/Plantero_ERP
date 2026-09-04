'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/empty-state';
import { Form, FormText, FormTextarea, FieldLabel, FormSelect } from '@/components/form/fields';
import { FormMoney } from '@/components/form/money-qty';
import { FormDate } from '@/components/form/date-field';
import { FormCombobox } from '@/components/form/combobox';
import { FormActions } from '@/components/form/form-actions';
import { MoneyCell } from '@/components/money-cell';
import { AllocationAmountInput } from '@/modules/finance/components/allocation-amount-input';
import { formatDate, parseMoneyInput } from '@/lib/format';
// '@plantero/core' barrel server-only kod da re-export eder (ör. node:crypto) — client bileşende
// yalnızca saf `money.ts` alt yolundan içe aktarılır (finans modülüyle aynı örüntü, bkz. dosya başı not).
import { D, ZERO, toDb } from '@plantero/core/money';
import { recordAccountingPaymentAction, getOpenInvoicesAction } from '../actions';
import type { OpenInvoiceRow } from '../queries';

const schema = z.object({
  direction: z.enum(['inbound', 'outbound']),
  partnerId: z.string().uuid('Cari seçin'),
  method: z.enum(['bank_transfer', 'cash', 'credit_card', 'cheque', 'marketplace_payout', 'other']),
  bankAccountId: z.string().optional().nullable(),
  paymentDate: z.string().min(1, 'Tarih girin'),
  currency: z.string().min(1),
  amount: z.string().min(1, 'Tutar girin'),
  reference: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Havale/EFT' },
  { value: 'cash', label: 'Kasa (nakit)' },
  { value: 'credit_card', label: 'Kredi kartı' },
  { value: 'cheque', label: 'Çek' },
  { value: 'marketplace_payout', label: 'Pazaryeri hakedişi' },
  { value: 'other', label: 'Diğer' },
];

export function RecordPaymentForm({
  partners,
  bankAccounts,
  defaultDirection = 'inbound',
}: {
  partners: Array<{ id: string; code: string; name: string; kind: string; currency: string }>;
  bankAccounts: Array<{ id: string; code: string; bankName: string; currency: string }>;
  defaultDirection?: 'inbound' | 'outbound';
}) {
  const router = useRouter();
  const [openInvoices, setOpenInvoices] = useState<OpenInvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      direction: defaultDirection, partnerId: '', method: 'bank_transfer', bankAccountId: '',
      paymentDate: new Date().toISOString().slice(0, 10), currency: 'TRY', amount: '', reference: '', note: '',
    },
  });

  const direction = form.watch('direction');
  const partnerId = form.watch('partnerId');
  const method = form.watch('method');
  const amount = form.watch('amount');
  const currency = form.watch('currency');
  const bankAccountId = form.watch('bankAccountId');

  const partnerOptions = useMemo(() => {
    const kinds = direction === 'inbound' ? ['customer', 'both'] : ['supplier', 'both'];
    return partners.filter((p) => kinds.includes(p.kind)).map((p) => ({ value: p.id, label: p.name, description: p.code }));
  }, [partners, direction]);

  const bankAccountOptions = useMemo(
    () => bankAccounts.filter((b) => b.currency === currency).map((b) => ({ value: b.id, label: `${b.code} — ${b.bankName}` })),
    [bankAccounts, currency],
  );

  useEffect(() => {
    if (bankAccountId && !bankAccountOptions.some((o) => o.value === bankAccountId)) form.setValue('bankAccountId', '');
  }, [bankAccountOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    form.setValue('partnerId', '');
    setOpenInvoices([]);
    setSelected({});
  }, [direction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelected({});
    if (!partnerId) { setOpenInvoices([]); return; }
    setLoadingInvoices(true);
    getOpenInvoicesAction({ partnerId, direction }).then((res) => {
      setOpenInvoices(res.ok ? res.data : []);
      setLoadingInvoices(false);
    });
    const partner = partners.find((p) => p.id === partnerId);
    if (partner) form.setValue('currency', partner.currency || 'TRY');
  }, [partnerId, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSelected = useMemo(() => Object.values(selected).reduce((acc, v) => acc.plus(D(v || 0)), ZERO), [selected]);
  const totalAmount = D(amount || 0);
  const remaining = totalAmount.minus(totalSelected);

  function toggleInvoice(inv: OpenInvoiceRow, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        const residual = D(inv.residual);
        const budget = remaining.gt(0) ? remaining : residual;
        next[inv.id] = toDb(residual.lt(budget) ? residual : budget);
      } else {
        delete next[inv.id];
      }
      return next;
    });
  }

  function setAmountFor(id: string, value: string) {
    setSelected((prev) => ({ ...prev, [id]: value }));
  }

  function autoDistribute() {
    let left = totalAmount;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (left.lte(0)) break;
      const residual = D(inv.residual);
      const take = residual.lt(left) ? residual : left;
      if (take.gt(0)) { next[inv.id] = toDb(take); left = left.minus(take); }
    }
    setSelected(next);
  }

  async function onSubmit(values: FormValues) {
    const checkedIds = Object.keys(selected);
    const allocations: { invoiceId: string; amount: string }[] = [];
    for (const id of checkedIds) {
      const parsed = parseMoneyInput(selected[id]);
      if (parsed === null || D(parsed).lte(0)) {
        const inv = openInvoices.find((o) => o.id === id);
        const msg = `${inv?.docNo ?? 'Seçili fatura'} için tahsis tutarı geçersiz. Satırı düzeltin veya işaretini kaldırın.`;
        form.setError('amount', { type: 'manual', message: msg });
        toast.error(msg);
        return;
      }
      allocations.push({ invoiceId: id, amount: parsed });
    }
    const res = await recordAccountingPaymentAction({ ...values, bankAccountId: values.method === 'cash' ? null : values.bankAccountId || null, allocations });
    if (res.ok) {
      toast.success(`${values.direction === 'inbound' ? 'Tahsilat' : 'Ödeme'} kaydedildi: ${res.data.docNo}`);
      startTransition(() => router.push('/muhasebe/tahsilatlar'));
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
        {/* max-w-3xl (tur 2 P1 muhasebe-tahsilat-yeni-01 kök nedeni): sınırsız 2 kolonlu ızgara
            1152px içerik alanına yayılıyordu, tek bir "Yön" select'i 568px genişliğe çıkıyordu —
            modülün geri kalanı ve diğer tüm modüller (receipt-form.tsx, order-form.tsx,
            sales-doc-form.tsx) formu max-w-3xl (768px) ile sınırlar; muhasebe formları bu
            konvansiyonun dışındaydı. */}
        <div className="max-w-3xl grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormSelect
            control={form.control}
            name="direction"
            label="Yön"
            required
            options={[
              { value: 'inbound', label: 'Tahsilat (müşteriden alınan)' },
              { value: 'outbound', label: 'Ödeme (tedarikçiye verilen)' },
            ]}
          />
          <FormCombobox control={form.control} name="partnerId" label={direction === 'inbound' ? 'Müşteri' : 'Tedarikçi'} required options={partnerOptions} placeholder="Cari seçin…" searchPlaceholder="Ara…" />
          <FormSelect control={form.control} name="method" label="Yöntem" required options={METHOD_OPTIONS} />
          {method !== 'cash' ? (
            <FormCombobox control={form.control} name="bankAccountId" label="Banka hesabı" options={bankAccountOptions} placeholder="Banka hesabı seçin…" />
          ) : (
            <div />
          )}
          <FormDate control={form.control} name="paymentDate" label="Tarih" required />
          <FormSelect control={form.control} name="currency" label="Para birimi" required options={[{ value: 'TRY', label: 'TRY — Türk Lirası' }, { value: 'EUR', label: 'EUR — Euro' }, { value: 'USD', label: 'USD — Amerikan Doları' }]} />
          <FormMoney control={form.control} name="amount" label="Tutar" required currency={form.watch('currency')} />
          <FormText control={form.control} name="reference" label="Referans (opsiyonel)" placeholder="Banka dekont no, açıklama…" />
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel>Faturaya tahsis</FieldLabel>
            {/* w-full h-11 mobilde (tur 2 P1 muhasebe-tahsilat-yeni-02 kök nedeni): 237.8×32px —
                dokunma hedefi eşiğinin (44px) altındaydı. sm:w-auto sm:h-9: masaüstünde eski kompakt
                boyuta döner. */}
            <Button type="button" variant="outline" size="sm" onClick={autoDistribute} disabled={!openInvoices.length || totalAmount.lte(0)} className="h-11 w-full sm:h-9 sm:w-auto">
              <Wand2 className="size-3.5" /> Otomatik dağıt (en eski önce)
            </Button>
          </div>
          {!partnerId ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Önce bir cari seçin.</p>
          ) : loadingInvoices ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Açık faturalar yükleniyor…</p>
          ) : !openInvoices.length ? (
            <EmptyState title="Açık fatura yok" description="Bu carinin kalan tutarlı faturası bulunmuyor. Tahsilat tahsissiz (cari üzerinde avans) olarak kaydedilir." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-1.5" />
                    <th className="py-1.5 font-medium">Fatura</th>
                    <th className="py-1.5 font-medium">Vade</th>
                    <th className="py-1.5 text-right font-medium">Kalan</th>
                    <th className="py-1.5 text-right font-medium">Tahsis</th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.map((inv) => {
                    const checked = inv.id in selected;
                    return (
                      <tr key={inv.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2">
                          <Checkbox checked={checked} onCheckedChange={(v) => toggleInvoice(inv, Boolean(v))} aria-label={`${inv.docNo} tahsis et`} />
                        </td>
                        <td className="py-2 font-mono text-xs">{inv.docNo}</td>
                        <td className="py-2 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                        <td className="py-2 text-right"><MoneyCell value={inv.residual} currency={inv.currency} /></td>
                        <td className="py-2">
                          <AllocationAmountInput
                            value={selected[inv.id] ?? ''}
                            onChange={(v) => setAmountFor(inv.id, v ?? '')}
                            disabled={!checked}
                            ariaLabel={`${inv.docNo} için tahsis edilecek para miktarı`}
                            className="ml-auto w-32"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 flex justify-end gap-4 text-[13px]">
                <span className="text-muted-foreground">Tahsis edilen: <MoneyCell value={totalSelected.toFixed(4)} currency={form.watch('currency')} /></span>
                <span className={remaining.lt(0) ? 'text-destructive' : 'text-muted-foreground'}>Kalan (tahsissiz): <MoneyCell value={remaining.toFixed(4)} currency={form.watch('currency')} /></span>
              </div>
            </div>
          )}
        </div>

        <FormTextarea control={form.control} name="note" label="Not (opsiyonel)" />

        <FormActions onCancel={() => router.back()} pending={form.formState.isSubmitting} submitLabel={direction === 'inbound' ? 'Tahsilatı kaydet' : 'Ödemeyi kaydet'} />
      </form>
    </Form>
  );
}

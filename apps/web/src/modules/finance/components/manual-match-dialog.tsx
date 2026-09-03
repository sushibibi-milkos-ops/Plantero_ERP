'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldLabel } from '@/components/form/fields';
import { Combobox } from '@/components/form/combobox';
import { NumberInput } from '@/components/form/number-input';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
// bkz. record-payment-form.tsx başındaki not — client'ta yalnızca money.ts alt yolundan içe aktar.
import { D } from '@plantero/core/money';
import { getOpenInvoicesAction, manualMatchAction } from '../actions';
import type { OpenInvoiceRow } from '../queries';
import type { BankTransactionRow } from '../queries';

/** Banka hareketini elle bir cari + faturaya bağlar (öneri beklemeden) */
export function ManualMatchDialog({ transaction, onOpenChange, partners }: { transaction: BankTransactionRow | null; onOpenChange: (v: boolean) => void; partners: Array<{ id: string; name: string; code: string; kind: string }> }) {
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [openInvoices, setOpenInvoices] = useState<OpenInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const direction: 'inbound' | 'outbound' = transaction && D(transaction.amount).gte(0) ? 'inbound' : 'outbound';
  const partnerOptions = partners
    .filter((p) => (direction === 'inbound' ? ['customer', 'both'] : ['supplier', 'both']).includes(p.kind))
    .map((p) => ({ value: p.id, label: p.name, description: p.code }));

  useEffect(() => {
    setPartnerId(null);
    setInvoiceId(null);
    setOpenInvoices([]);
    setAmount(transaction ? D(transaction.amount).abs().toFixed(4) : '');
  }, [transaction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!partnerId) { setOpenInvoices([]); return; }
    setLoading(true);
    getOpenInvoicesAction({ partnerId, direction }).then((res) => {
      setOpenInvoices(res.ok ? res.data : []);
      setLoading(false);
    });
  }, [partnerId, direction]);

  function submit() {
    if (!transaction || !partnerId || !invoiceId || !amount) return;
    startTransition(async () => {
      const res = await manualMatchAction({ bankTransactionId: transaction.id, partnerId, invoiceId, amount });
      if (res.ok) {
        toast.success('Banka hareketi eşleştirildi');
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={Boolean(transaction)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Elle eşleştir</DialogTitle>
          <DialogDescription>{transaction?.description}{transaction ? ` — ${formatDate(transaction.txDate)}` : ''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel required>{direction === 'inbound' ? 'Müşteri' : 'Tedarikçi'}</FieldLabel>
            <Combobox value={partnerId} onChange={(v) => { setPartnerId(v); setInvoiceId(null); }} options={partnerOptions} placeholder="Cari seçin…" searchPlaceholder="Ara…" />
          </div>

          {partnerId ? (
            loading ? (
              <p className="text-[13px] text-muted-foreground">Açık faturalar yükleniyor…</p>
            ) : !openInvoices.length ? (
              <p className="text-[13px] text-muted-foreground">Bu carinin açık faturası yok.</p>
            ) : (
              <div className="space-y-1.5">
                <FieldLabel required>Fatura</FieldLabel>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/60 p-1.5">
                  {openInvoices.map((inv) => (
                    <button
                      type="button"
                      key={inv.id}
                      onClick={() => { setInvoiceId(inv.id); setAmount(D(inv.residual).lt(D(amount || 0)) ? amount : inv.residual); }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px] transition-colors ${invoiceId === inv.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                    >
                      <span className="font-mono text-xs">{inv.docNo}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(inv.dueDate)}</span>
                      <MoneyCell value={inv.residual} currency={inv.currency} />
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : null}

          <div className="space-y-1.5">
            <FieldLabel required>Tutar</FieldLabel>
            <NumberInput value={amount} onChange={(v) => setAmount(v ?? '')} maxDigits={2} minDigits={2} prefix="₺" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending || !partnerId || !invoiceId || !D(amount || 0).gt(0)}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Eşleştir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

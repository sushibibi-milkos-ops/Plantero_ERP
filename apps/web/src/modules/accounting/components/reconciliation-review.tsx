'use client';

import { useEffect, useMemo, useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, PenLine, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/form/combobox';
import { NumberInput } from '@/components/form/number-input';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';
import { D, toDb } from '@plantero/core/money';
import { approveReconciliationMatchAction, rejectReconciliationMatchAction, manualReconciliationMatchAction } from '../actions';
import { SignedAmount } from './signed-amount';
import type { ReconciliationQueueItem, ReconciliationCandidateView } from '../queries';

const KIND_LABELS: Record<string, string> = {
  invoice: 'Fatura', partner_on_account: 'Cari avans', loan_installment: 'Kredi taksiti', expense: 'Gider', fee: 'Banka masrafı',
  marketplace_payout: 'Pazaryeri hakedişi', transfer: 'Transfer', tax: 'Vergi', unknown: 'Bilinmiyor',
};

function candidateSummary(c: ReconciliationCandidateView): string {
  if (c.kind === 'invoice') return c.invoiceDocNos.length ? `${c.partnerName ?? '—'} — ${c.invoiceDocNos.join(', ')}` : (c.partnerName ?? '—');
  if (c.kind === 'partner_on_account') return c.partnerName ?? '—';
  if (c.kind === 'loan_installment') return c.loanCode ? `Kredi ${c.loanCode}` : 'Kredi taksiti';
  if (c.kind === 'expense' || c.kind === 'fee') return c.expenseAccountCode ? `Gider hesabı ${c.expenseAccountCode}` : 'Gider';
  return KIND_LABELS[c.kind] ?? c.kind;
}

function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 92 ? 'bg-success' : pct >= 70 ? 'bg-info' : 'bg-warning';
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {/* w-16 (mobilde) → w-24 (sm+): 390px'te sabit w-24 çubuk + 106px düğme + kırpılmayan sol metin
          bloğu birlikte satırı 390px'in dışına itiyordu (tur 2 P0 muhasebe-mutabakat-01). */}
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-24">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">%{pct}</span>
    </div>
  );
}

export function ReconciliationReview({
  queue,
  partners,
  expenseAccounts,
}: {
  queue: ReconciliationQueueItem[];
  partners: Array<{ id: string; name: string; code: string }>;
  expenseAccounts: Array<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualKind, setManualKind] = useState<'invoice' | 'partner_on_account' | 'expense'>('expense');
  const [manualPartnerId, setManualPartnerId] = useState('');
  const [manualExpenseCode, setManualExpenseCode] = useState('');
  const [manualAmount, setManualAmount] = useState<string | null>(null);

  useEffect(() => {
    if (index >= queue.length) setIndex(Math.max(0, queue.length - 1));
  }, [queue.length, index]);

  const current = queue[index];
  const bestCandidate = current?.candidates[0];

  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, queue.length - 1)), [queue.length]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  const approve = useCallback(async (matchId?: string) => {
    const id = matchId ?? bestCandidate?.matchId;
    if (!id || busy) return;
    setBusy(true);
    const res = await approveReconciliationMatchAction({ matchId: id });
    setBusy(false);
    if (res.ok) {
      toast.success('Öneri onaylandı — tahsilat/fiş üretildi');
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }, [bestCandidate, busy, router, startTransition]);

  const reject = useCallback(async () => {
    if (!bestCandidate || busy) return;
    setBusy(true);
    const res = await rejectReconciliationMatchAction({ matchId: bestCandidate.matchId, reason: rejectReason.trim() || null });
    setBusy(false);
    if (res.ok) {
      toast.success('Öneri reddedildi');
      setRejectOpen(false);
      setRejectReason('');
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }, [bestCandidate, busy, rejectReason, router, startTransition]);

  const submitManual = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    const res = await manualReconciliationMatchAction({
      bankTransactionId: current.bankTransactionId, kind: manualKind,
      partnerId: manualKind !== 'expense' ? manualPartnerId || null : null,
      expenseAccountCode: manualKind === 'expense' ? manualExpenseCode : null,
      amount: manualAmount ?? undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast.success('Elle eşleştirildi');
      setManualOpen(false);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }, [current, busy, manualKind, manualPartnerId, manualExpenseCode, manualAmount, router, startTransition]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (rejectOpen || manualOpen) return;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); goNext(); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); goPrev(); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); void approve(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setRejectOpen(true); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, approve, rejectOpen, manualOpen]);

  const partnerOptions = useMemo(() => partners.map((p) => ({ value: p.id, label: p.name, description: p.code })), [partners]);
  const expenseOptions = useMemo(() => expenseAccounts.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` })), [expenseAccounts]);

  if (!queue.length) {
    return <EmptyState title="Onay bekleyen öneri yok" description="AI Mutabakat Ajanı yeni öneriler ürettiğinde (ekstre içe aktarıldığında ya da mutabakat çalıştırıldığında) burada listelenecek." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground lg:hidden">
        <Keyboard className="size-3.5" /> J/K gez · A onayla · R reddet
      </div>

      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border/60 lg:max-h-[calc(100vh-260px)]">
        {queue.map((item, i) => {
          const best = item.candidates[0];
          const selected = i === index;
          return (
            <button
              key={item.bankTransactionId}
              type="button"
              onClick={() => setIndex(i)}
              className={`flex w-full flex-col gap-1 border-b border-border/40 px-3 py-2.5 text-left last:border-0 ${selected ? 'bg-primary/8' : 'hover:bg-muted/50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{item.description}</span>
                <SignedAmount value={item.amount} currency={item.currency} className="shrink-0 text-[13px]" />
              </div>
              <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                <span>{formatDate(item.txDate)} · {item.bankAccountCode}</span>
                {best ? <span className="font-mono tabular-nums">%{Math.round(Number(best.confidence) * 100)}</span> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/60 p-5">
        {current ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-medium">{current.description}</div>
                <div className="text-[13px] text-muted-foreground">{formatDate(current.txDate)} · {current.bankAccountCode}{current.counterpartyName ? ` · ${current.counterpartyName}` : ''}</div>
              </div>
              <SignedAmount value={current.amount} currency={current.currency} className="text-base" />
            </div>

            {bestCandidate ? (
              <div className="mb-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-primary">{KIND_LABELS[bestCandidate.kind] ?? bestCandidate.kind}</span>
                  <ConfidenceBar value={Number(bestCandidate.confidence)} />
                </div>
                <div className="mb-1 text-[14px] font-medium">{candidateSummary(bestCandidate)}</div>
                {bestCandidate.rationale ? <p className="text-[13px] text-muted-foreground">{bestCandidate.rationale}</p> : null}
              </div>
            ) : null}

            {current.candidates.length > 1 ? (
              <div className="mb-4">
                <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">Alternatif adaylar</div>
                <div className="space-y-1.5">
                  {/* flex-col sm:flex-row (tur 2 P0 muhasebe-mutabakat-01 kök nedeni): sabit genişlikli
                      güven çubuğu + 106px düğme + küçülmeyen sol metin bloğu tek satırda 390px'i
                      zorluyordu — "Bunu onayla" düğmesi viewport'un tamamen dışına taşıyordu (app-shell
                      taşmayı kırptığı için yatay kaydırmayla da erişilemiyordu). Mobilde iki satıra
                      ayrılır: üstte metin (min-w-0 + truncate), altta güven çubuğu + tam genişlik düğme. */}
                  {current.candidates.slice(1).map((c) => (
                    <div key={c.matchId} className="flex flex-col gap-2 rounded-md border border-border/50 px-3 py-2 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 truncate">
                        <span className="mr-2 text-muted-foreground">{KIND_LABELS[c.kind] ?? c.kind}</span>
                        {candidateSummary(c)}
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <ConfidenceBar value={Number(c.confidence)} />
                        {/* h-11 sm:h-9 (kritik bulgu, muhasebe-mobil-buton-01): 390px'te 36px
                            yükseklikteydi (44px hedefinin altında). */}
                        <Button variant="ghost" size="sm" onClick={() => approve(c.matchId)} disabled={busy} className="h-11 shrink-0 sm:h-9">Bunu onayla</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!rejectOpen && !manualOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => approve()} disabled={busy || !bestCandidate}><Check className="size-4" /> Onayla <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">A</kbd></Button>
                <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={busy || !bestCandidate}><X className="size-4" /> Reddet <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">R</kbd></Button>
                <Button variant="outline" onClick={() => setManualOpen(true)} disabled={busy}><PenLine className="size-4" /> Elle eşle</Button>
                <span className="ml-auto hidden items-center gap-1.5 text-[12px] text-muted-foreground lg:flex"><Keyboard className="size-3.5" /> J/K gez · A onayla · R reddet</span>
              </div>
            ) : null}

            {rejectOpen ? (
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Red gerekçesi (opsiyonel)…" rows={2} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)} disabled={busy}>Vazgeç</Button>
                  <Button variant="destructive" size="sm" onClick={reject} disabled={busy}>Reddet</Button>
                </div>
              </div>
            ) : null}

            {manualOpen ? (
              <div className="space-y-3 rounded-lg border border-border/60 p-3">
                <Select value={manualKind} onValueChange={(v) => setManualKind(v as typeof manualKind)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gider hesabına işle</SelectItem>
                    <SelectItem value="partner_on_account">Cari avans (tahsissiz)</SelectItem>
                  </SelectContent>
                </Select>
                {manualKind === 'expense' ? (
                  <Combobox value={manualExpenseCode} onChange={(v) => setManualExpenseCode(v ?? '')} options={expenseOptions} placeholder="Gider hesabı seçin…" searchPlaceholder="Ara…" />
                ) : (
                  <Combobox value={manualPartnerId} onChange={(v) => setManualPartnerId(v ?? '')} options={partnerOptions} placeholder="Cari seçin…" searchPlaceholder="Ara…" />
                )}
                <NumberInput value={manualAmount} onChange={setManualAmount} placeholder={`Tutar (varsayılan: ${toDb(D(current.amount).abs())})`} maxDigits={2} minDigits={2} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setManualOpen(false)} disabled={busy}>Vazgeç</Button>
                  <Button size="sm" onClick={submitManual} disabled={busy || (manualKind === 'expense' ? !manualExpenseCode : !manualPartnerId)}>Eşleştir</Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormText, FormCheckbox, FieldLabel } from '@/components/form/fields';
import { FormQty } from '@/components/form/money-qty';
import { FormActions } from '@/components/form/form-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { DetailFieldGroups, type DetailFieldGroup } from '@/components/detail-fields';
import { DocumentChain } from '@/components/document-chain';
import { formatDateTime, formatQty } from '@/lib/format';
import { recordResultsAction, decideCheckAction } from '../actions';
import type { QcCheckDetail } from '../queries';

type LocationOption = { id: string; code: string; name: string };

const resultsSchema = z.object({
  sampledQty: z.string().optional(),
  items: z.array(z.object({
    templateItemId: z.string().uuid().optional().nullable(),
    name: z.string().min(1),
    kind: z.enum(['numeric', 'boolean', 'text', 'document']),
    minValue: z.string().optional().nullable(),
    maxValue: z.string().optional().nullable(),
    unit: z.string().optional().nullable(),
    valueNumeric: z.string().optional(),
    valueBool: z.boolean().optional(),
    valueText: z.string().optional(),
  })),
});
type ResultsForm = z.infer<typeof resultsSchema>;

export function CheckDetail({ detail, releaseLocations, rejectLocations }: { detail: QcCheckDetail; releaseLocations: LocationOption[]; rejectLocations: LocationOption[] }) {
  const router = useRouter();
  const { check, product, lot, supplier, receipt, template, results, inspector, chain } = detail;
  const isPending = check.result === 'pending';
  const hasResults = results.length > 0;

  const resultsByItem = new Map(results.map((r) => [r.templateItemId ?? r.id, r]));
  const defaultItems: ResultsForm['items'] = template
    ? template.items.map((ti) => {
        const existing = resultsByItem.get(ti.id);
        return {
          templateItemId: ti.id, name: ti.name, kind: ti.kind as 'numeric' | 'boolean' | 'text' | 'document',
          minValue: ti.minValue, maxValue: ti.maxValue, unit: ti.unit,
          valueNumeric: existing?.valueNumeric ?? '', valueBool: existing?.valueBool ?? false, valueText: existing?.valueText ?? '',
        };
      })
    : [{ templateItemId: null, name: results[0]?.name ?? 'Genel değerlendirme', kind: 'text' as const, minValue: null, maxValue: null, unit: null, valueNumeric: '', valueBool: false, valueText: results[0]?.valueText ?? '' }];

  const form = useForm<ResultsForm>({ resolver: zodResolver(resultsSchema), defaultValues: { sampledQty: check.sampledQty ?? '', items: defaultItems } });
  const { fields } = useFieldArray({ control: form.control, name: 'items' });
  const [savingResults, setSavingResults] = useState(false);

  async function onSaveResults(values: ResultsForm) {
    setSavingResults(true);
    const res = await recordResultsAction({
      checkId: check.id, sampledQty: values.sampledQty || null,
      items: values.items.map((it) => ({
        templateItemId: it.templateItemId, name: it.name, kind: it.kind,
        valueNumeric: it.kind === 'numeric' ? (it.valueNumeric || null) : null,
        valueBool: it.kind === 'boolean' ? Boolean(it.valueBool) : null,
        valueText: it.kind === 'text' || it.kind === 'document' ? (it.valueText || null) : null,
      })),
    });
    setSavingResults(false);
    if (res.ok) { toast.success(res.data.allPassed ? 'Sonuçlar kaydedildi — tümü uygun' : 'Sonuçlar kaydedildi — uygunsuzluk var'); router.refresh(); }
    else toast.error(res.error);
  }

  const [decisionBusy, setDecisionBusy] = useState<'released' | 'rejected' | null>(null);
  const [releaseLocationId, setReleaseLocationId] = useState(releaseLocations[0]?.id ?? '');
  const [rejectLocationId, setRejectLocationId] = useState(rejectLocations[0]?.id ?? '');
  const [decisionNote, setDecisionNote] = useState('');
  const [returnToSupplier, setReturnToSupplier] = useState(false);

  async function decide(decision: 'released' | 'rejected') {
    setDecisionBusy(decision);
    const res = await decideCheckAction({
      checkId: check.id, decision, note: decisionNote || null,
      releaseToLocationId: decision === 'released' ? releaseLocationId : null,
      rejectToLocationId: decision === 'rejected' ? rejectLocationId : null,
      returnToSupplier: decision === 'rejected' ? returnToSupplier : undefined,
    });
    setDecisionBusy(null);
    if (res.ok) { toast.success(decision === 'released' ? 'Lot serbest bırakıldı' : 'Lot reddedildi'); router.refresh(); }
    else toast.error(res.error);
  }

  const infoGroups: DetailFieldGroup[] = [
    {
      title: 'Genel', fields: [
        { label: 'Ürün', value: product.name, node: <span>{product.name} <span className="text-muted-foreground">· {product.sku}</span></span> },
        { label: 'Lot', value: lot?.lotNo, node: lot ? <LotBadge lotNo={lot.lotNo} id={lot.id} status={lot.status} /> : <span className="text-muted-foreground">—</span> },
        { label: 'Eldeki miktar', value: lot?.onHandQty, node: lot ? <span className="num">{formatQty(lot.onHandQty)} {lot.locationCode ? `· ${lot.locationCode}` : ''}</span> : <span className="text-muted-foreground">—</span> },
        { label: 'Tedarikçi', value: supplier?.name, node: supplier?.name ?? <span className="text-muted-foreground">—</span> },
        { label: 'Mal kabul', value: receipt?.docNo, node: receipt?.docNo ?? <span className="text-muted-foreground">—</span> },
        { label: 'Şablon', value: template?.name, node: template?.name ?? <span className="text-muted-foreground">Yok — genel değerlendirme</span> },
        { label: 'Açılış', value: check.createdAt, node: formatDateTime(check.createdAt) },
      ],
    },
  ];
  if (!isPending) {
    infoGroups.push({
      title: 'Karar', fields: [
        { label: 'Karar', value: check.disposition, node: <StatusBadge status={check.result} kind="qc" /> },
        { label: 'Karar tarihi', value: check.checkedAt, node: check.checkedAt ? formatDateTime(check.checkedAt) : '—' },
        { label: 'Kontrol eden', value: inspector?.fullName, node: inspector?.fullName ?? <span className="text-muted-foreground">Sistem</span> },
        { label: 'Not', value: check.decisionNote, node: check.decisionNote ?? <span className="text-muted-foreground">—</span> },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={check.result} kind="qc" size="md" />
        <span className="text-sm text-muted-foreground">{check.kind === 'incoming' ? 'Girdi kalite kontrolü' : check.kind === 'in_process' ? 'Ara kontrol' : 'Final kontrol'}</span>
      </div>

      <div className="rounded-xl border border-border/60 p-4">
        <DetailFieldGroups groups={infoGroups} />
      </div>

      {chain && (chain.upstream.length || chain.downstream.length) ? (
        <div className="rounded-xl border border-border/60 p-4">
          <div className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Belge zinciri</div>
          <DocumentChain
            upstream={chain.upstream.map((n) => ({ type: n.type, id: n.id, docNo: n.docNo, status: n.status, date: n.date, amount: n.amount, partnerName: n.partnerName }))}
            current={{ type: 'quality_check', id: check.id, docNo: check.docNo, status: check.result, date: check.createdAt, amount: null, partnerName: supplier?.name ?? null }}
            downstream={chain.downstream.map((n) => ({ type: n.type, id: n.id, docNo: n.docNo, status: n.status, date: n.date, amount: n.amount, partnerName: n.partnerName }))}
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-border/60 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Sonuç girişi</h2>
          {!isPending ? <span className="text-xs text-muted-foreground">Karar verildi — düzenlenemez</span> : null}
        </div>

        {isPending ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSaveResults)} className="space-y-4">
              <FormQty control={form.control} name="sampledQty" label="Numune miktarı" placeholder="0" />
              <div className="space-y-3">
                {fields.map((f, i) => {
                  const kind = form.watch(`items.${i}.kind`);
                  const min = form.watch(`items.${i}.minValue`);
                  const max = form.watch(`items.${i}.maxValue`);
                  return (
                    <div key={f.id} className="rounded-lg border border-border/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">{f.name}</span>
                        {kind === 'numeric' && (min || max) ? <span className="text-xs text-muted-foreground">{min ?? '–'} … {max ?? '–'} {f.unit ?? ''}</span> : null}
                      </div>
                      {kind === 'numeric' ? (
                        <FormQty control={form.control} name={`items.${i}.valueNumeric`} placeholder="Ölçülen değer" />
                      ) : kind === 'boolean' ? (
                        <FormCheckbox control={form.control} name={`items.${i}.valueBool`} label="Uygun" />
                      ) : (
                        <FormText control={form.control} name={`items.${i}.valueText`} placeholder={kind === 'document' ? 'Belge referansı / no' : 'Not'} />
                      )}
                    </div>
                  );
                })}
              </div>
              <FormActions submitLabel="Sonuçları Kaydet" pending={savingResults} sticky={false} />
            </form>
          </Form>
        ) : (
          <ul className="divide-y divide-border/60">
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{r.name}</span>
                <span className={r.isPassed === false ? 'font-medium text-destructive' : r.isPassed === true ? 'text-success' : 'text-muted-foreground'}>
                  {r.valueNumeric ?? (r.valueBool !== null ? (r.valueBool ? 'Uygun' : 'Uygun değil') : r.valueText) ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isPending && hasResults ? (
        <div className="rounded-xl border border-border/60 p-4">
          <h2 className="mb-4 text-sm font-medium">Karar</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-success/30 bg-success/[0.03] p-3">
              <FieldLabel htmlFor="release-loc">Serbest bırakma lokasyonu</FieldLabel>
              <Select value={releaseLocationId} onValueChange={setReleaseLocationId}>
                <SelectTrigger id="release-loc" className="w-full data-[size=default]:h-11 md:data-[size=default]:h-9"><SelectValue placeholder="Lokasyon seçin" /></SelectTrigger>
                <SelectContent>{releaseLocations.map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" className="w-full" disabled={decisionBusy !== null || !releaseLocationId} onClick={() => decide('released')}>
                {decisionBusy === 'released' ? '…' : <><CheckCircle2 className="size-4" /> Serbest Bırak</>}
              </Button>
            </div>
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/[0.03] p-3">
              <FieldLabel htmlFor="reject-loc">Red lokasyonu</FieldLabel>
              <Select value={rejectLocationId} onValueChange={setRejectLocationId}>
                <SelectTrigger id="reject-loc" className="w-full data-[size=default]:h-11 md:data-[size=default]:h-9"><SelectValue placeholder="Lokasyon seçin" /></SelectTrigger>
                <SelectContent>{rejectLocations.map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={returnToSupplier} onCheckedChange={(v) => setReturnToSupplier(Boolean(v))} /> Tedarikçiye iade et
              </label>
              <Button type="button" variant="destructive" className="w-full" disabled={decisionBusy !== null || !rejectLocationId} onClick={() => decide('rejected')}>
                {decisionBusy === 'rejected' ? '…' : <><XCircle className="size-4" /> Reddet</>}
              </Button>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <FieldLabel>Karar notu</FieldLabel>
            <Textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2} placeholder="Opsiyonel" className="text-[13px]" />
          </div>
        </div>
      ) : isPending ? (
        <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          <ClipboardCheck className="mx-auto mb-2 size-5" /> Karar verebilmek için önce sonuçları kaydedin.
        </div>
      ) : null}
    </div>
  );
}

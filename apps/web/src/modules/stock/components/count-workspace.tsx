'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ScanLine, ClipboardCheck, Send, CheckCircle2, Save, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LotBadge } from '@/components/lot-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { Combobox } from '@/components/form/combobox';
import { NumberInput } from '@/components/form/number-input';
import { snapshotCountAction, recordCountAction, submitReviewAction, approveCountAction, postCountAction } from '../actions';
import type { ProductPickerRow } from '../queries';

export type CountLineVm = {
  id: string; productId: string; productName: string; sku: string; lotId: string | null; lotNo: string | null;
  locationId: string; locationCode: string; uomCode: string; systemQty: string; countedQty: string | null; varianceQty: string; unitCost: string;
};

function CountedQtyInput({ line, disabled, onCommit }: { line: CountLineVm; disabled: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(line.countedQty);
  return (
    <NumberInput
      value={draft}
      onChange={setDraft}
      onBlur={() => { if (draft !== null && draft !== line.countedQty) onCommit(draft); }}
      maxDigits={3}
      suffix={line.uomCode}
      disabled={disabled}
      className="h-11 w-32 text-[15px]"
    />
  );
}

export function CountWorkspace({
  countId,
  status,
  varianceValue,
  lines,
  products,
  canCount,
  canApprove,
}: {
  countId: string;
  status: string;
  varianceValue: string;
  lines: CountLineVm[];
  products: ProductPickerRow[];
  canCount: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locationFilter, setLocationFilter] = useState('');
  const [addingProduct, setAddingProduct] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!locationFilter.trim()) return lines;
    const q = locationFilter.trim().toLocaleLowerCase('tr-TR');
    return lines.filter((l) => l.locationCode.toLocaleLowerCase('tr-TR').includes(q));
  }, [lines, locationFilter]);

  const countedLines = lines.filter((l) => l.countedQty !== null).length;

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function onSnapshot() {
    const res = await snapshotCountAction({ id: countId });
    if (res.ok) { toast.success('Sayım görüntüsü alındı'); refresh(); } else toast.error(res.error);
  }

  async function onRecord(lineId: string, value: string) {
    if (value.trim() === '') return;
    const res = await recordCountAction({ countId, lineId, countedQty: value });
    if (res.ok) refresh();
    else toast.error(res.error);
  }

  async function onAddNew(locationId: string) {
    if (!addingProduct) return;
    const res = await recordCountAction({ countId, productId: addingProduct, locationId, countedQty: '0' });
    if (res.ok) { setAddingProduct(null); refresh(); } else toast.error(res.error);
  }

  async function onSubmitReview() {
    const res = await submitReviewAction({ id: countId });
    if (res.ok) { toast.success('İncelemeye gönderildi'); refresh(); } else toast.error(res.error);
  }

  async function onApprove() {
    const res = await approveCountAction({ id: countId });
    if (res.ok) {
      if (res.data.status === 'approved') toast.success('Sayım onaylandı');
      else toast.info('Fark 5.000 TL üzerinde — Genel Müdür onayı bekleniyor');
      refresh();
    } else toast.error(res.error);
  }

  async function onPost() {
    const res = await postCountAction({ id: countId });
    if (res.ok) { toast.success('Sayım kaydedildi'); refresh(); } else toast.error(res.error);
  }

  if (status === 'draft') {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Görüntü henüz alınmadı"
        description="Sayım kapsamındaki lokasyonlardaki sistem miktarları görüntü olarak alınınca sayım girişine başlayabilirsiniz."
        action={canCount ? <Button size="lg" className="h-11" onClick={onSnapshot} disabled={pending}>Görüntü al</Button> : undefined}
      />
    );
  }

  if (status === 'counting') {
    const productOptions = products.map((p) => ({ value: p.id, label: p.name, description: p.sku }));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} placeholder="Lokasyon okut/ara…" className="h-11 pl-9 font-mono text-[15px]" />
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">{countedLines}/{lines.length} sayıldı</span>
        </div>

        {canCount ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/70 p-3">
            <span className="text-sm text-muted-foreground">Bulunmayan ürün ekle:</span>
            <Combobox value={addingProduct} onChange={setAddingProduct} options={productOptions} placeholder="Ürün ara…" className="w-64" />
            {addingProduct && locationFilter ? (
              <Button size="sm" variant="outline" onClick={() => onAddNew(lines.find((l) => l.locationCode.toLocaleLowerCase('tr-TR') === locationFilter.trim().toLocaleLowerCase('tr-TR'))?.locationId ?? lines[0]?.locationId ?? '')}>
                <Plus className="size-3.5" /> Ekle
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <EmptyState compact title="Bu lokasyonda satır yok" />
          ) : (
            filtered.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{l.productName}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{l.locationCode}</span>
                    {l.lotNo ? <LotBadge lotNo={l.lotNo} className="h-4 px-1 text-[10px]" /> : null}
                    <span>sistem: {l.systemQty}</span>
                  </div>
                </div>
                <CountedQtyInput line={l} disabled={!canCount} onCommit={(v) => onRecord(l.id, v)} />
              </div>
            ))
          )}
        </div>

        {canCount ? (
          <Button size="lg" className="h-12 w-full text-base" onClick={onSubmitReview} disabled={pending || countedLines < lines.length}>
            <Send className="size-4" /> İncelemeye gönder {countedLines < lines.length ? `(${lines.length - countedLines} satır kaldı)` : ''}
          </Button>
        ) : null}
      </div>
    );
  }

  // review / approved / posted — fark tablosu
  const varianceLines = lines.filter((l) => Number(l.varianceQty) !== 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">Toplam fark değeri</span>
        <MoneyCell value={varianceValue} signed className="text-base font-semibold" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[12px] text-muted-foreground">
              <th className="h-9 px-3">Ürün</th>
              <th className="h-9 px-3">Lokasyon</th>
              <th className="h-9 px-3 text-right">Sistem</th>
              <th className="h-9 px-3 text-right">Sayılan</th>
              <th className="h-9 px-3 text-right">Fark</th>
              <th className="h-9 px-3 text-right">Fark değeri</th>
            </tr>
          </thead>
          <tbody>
            {varianceLines.length === 0 ? (
              <tr><td colSpan={6}><EmptyState compact title="Fark yok" description="Tüm satırlar sistemle uyumlu." /></td></tr>
            ) : (
              varianceLines.map((l) => (
                <tr key={l.id} className="h-10 border-b border-border/50 last:border-0">
                  <td className="px-3">{l.productName} {l.lotNo ? <LotBadge lotNo={l.lotNo} className="ml-1.5" /> : null}</td>
                  <td className="px-3 font-mono text-xs">{l.locationCode}</td>
                  <td className="px-3 text-right"><QtyCell value={l.systemQty} /></td>
                  <td className="px-3 text-right"><QtyCell value={l.countedQty} /></td>
                  <td className="px-3 text-right"><QtyCell value={l.varianceQty} /></td>
                  <td className="px-3 text-right"><MoneyCell value={(Number(l.varianceQty) * Number(l.unitCost)).toFixed(4)} signed /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {status === 'review' && canApprove ? (
        <Button size="lg" className="h-11" onClick={onApprove} disabled={pending}>
          <CheckCircle2 className="size-4" /> Onayla
        </Button>
      ) : null}
      {status === 'approved' && canApprove ? (
        <Button size="lg" className="h-11" onClick={onPost} disabled={pending}>
          <Save className="size-4" /> Kaydet
        </Button>
      ) : null}
    </div>
  );
}

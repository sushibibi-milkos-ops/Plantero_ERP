'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ScanLine, CheckCircle2, PackageCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { scanCodeAction, confirmPickAction } from '../actions';

export type PickLine = {
  id: string; productName: string; sku: string; qty: string; pickedQty: string; uomCode: string;
  lotId: string | null; lotNo: string | null; expiryDate: string | null; locationCode: string | null;
};

export function PickScreen({ deliveryId, docNo, initialLines }: { deliveryId: string; docNo: string; initialLines: PickLine[] }) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pendingLines = useMemo(() => lines.filter((l) => Number(l.pickedQty) < Number(l.qty)), [lines]);
  const doneCount = lines.length - pendingLines.length;
  const current = pendingLines[0];

  async function handleScan() {
    const value = code.trim();
    if (!value || !current) return;
    setPending(true);
    try {
      if (current.lotId) {
        const scan = await scanCodeAction({ code: value });
        if (!scan.ok) {
          toast.error(scan.error);
          return;
        }
        const lotId = scan.data.kind === 'lot' ? scan.data.lot.id : null;
        if (!lotId) {
          toast.error('Bu bir lot kodu değil — beklenen: LOT:… veya lot numarası');
          return;
        }
        const res = await confirmPickAction({ deliveryId, lineId: current.id, scannedLotId: lotId });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      } else {
        const res = await confirmPickAction({ deliveryId, lineId: current.id, scannedLotId: null });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      }
      setLines((prev) => prev.map((l) => (l.id === current.id ? { ...l, pickedQty: l.qty } : l)));
      toast.success(`${current.productName} toplandı`);
      setCode('');
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-6 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-success/12 text-success mx-auto">
          <PackageCheck className="size-8" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Toplama tamamlandı</h2>
          <p className="text-sm text-muted-foreground">{docNo} irsaliyesindeki tüm satırlar toplandı.</p>
        </div>
        <Button size="lg" className="h-14 w-full text-base" onClick={() => router.push(`/depo/sevkiyat/${deliveryId}`)}>
          İrsaliyeye dön ve sevk et
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/depo/sevkiyat/${deliveryId}`)} className="h-11 px-2 text-muted-foreground">
          <ArrowLeft className="size-4" /> {docNo}
        </Button>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{doneCount}/{lines.length} toplandı</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(doneCount / lines.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sıradaki satır</div>
        <div className="mb-1 text-xl font-semibold">{current.productName}</div>
        <div className="mb-4 font-mono text-sm text-muted-foreground">{current.sku}</div>
        <div className="flex flex-wrap items-center gap-2">
          {current.lotNo ? <LotBadge lotNo={current.lotNo} id={current.lotId ?? undefined} className="h-11 px-3 text-[13px]" /> : <span className="text-sm text-muted-foreground">Lotsuz ürün</span>}
          {current.expiryDate ? <ExpiryBadge date={current.expiryDate} /> : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Lokasyon</div>
            <div className="mt-0.5 font-mono text-base font-medium">{current.locationCode ?? '—'}</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Miktar</div>
            <div className="mt-0.5"><QtyCell value={current.qty} uom={current.uomCode} className="text-base font-medium" /></div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <ScanLine className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
            placeholder={current.lotId ? 'Lot okut…' : 'Enter ile onayla…'}
            disabled={pending}
            className="h-14 pl-11 text-base font-mono"
          />
        </div>
        <Button size="lg" className="h-14 w-full text-base" onClick={handleScan} disabled={pending}>
          <CheckCircle2 className="size-5" /> Onayla
        </Button>
      </div>

      {pendingLines.length > 1 ? (
        <div className="pt-2">
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sırada bekleyen ({pendingLines.length - 1})</div>
          <ul className="space-y-1.5">
            {pendingLines.slice(1).map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                <span className="truncate">{l.productName}</span>
                <QtyCell value={l.qty} uom={l.uomCode} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {lines.length === 0 ? <EmptyState compact title="Toplanacak satır yok" /> : null}
    </div>
  );
}

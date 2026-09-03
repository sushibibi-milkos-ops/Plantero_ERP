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
import { useFocusMode } from '@/components/app-shell/use-focus-mode';
import { scanCodeAction, confirmPickAction } from '../actions';

export type PickLine = {
  id: string; productName: string; sku: string; qty: string; pickedQty: string; uomCode: string;
  lotId: string | null; lotNo: string | null; expiryDate: string | null; locationCode: string | null;
};

export function PickScreen({ deliveryId, docNo, initialLines }: { deliveryId: string; docNo: string; initialLines: PickLine[] }) {
  const router = useRouter();
  // Toplama tek görevli, kesintiye kapalı bir akıştır — kenar çubuğu + üst bar dikkat dağıtır ve
  // 1440px'te içeriği 448px'lik dar bir kolona sıkıştırır. Kabuksuz (odak modu) render edilir.
  useFocusMode();
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

  function skipCurrent() {
    if (!current) return;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === current.id);
      if (idx === -1) return prev;
      const next = [...prev];
      const [line] = next.splice(idx, 1);
      if (!line) return prev;
      // Sırada bekleyenlerin sonuna taşınır (henüz toplanmadı, sadece sıradan çıkar) — operatörün
      // eksik/bulunamayan bir lotta akışta kilitlenmemesi için (Tur 3 P2 bulgusu).
      next.splice(pendingLines.length - 1, 0, line);
      return next;
    });
    toast.info(`${current.productName} atlandı — sırada bekleyenlere taşındı`);
    setCode('');
  }

  if (!current) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center space-y-4 py-6 text-center md:min-h-[calc(100dvh-3rem)]">
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
    // Önceki sürüm `mx-auto max-w-md` ile sabitlenmişti — 1440px depo terminalinde ~1000px, 1024px
    // el terminalinde ~570px ölü gri alan kalıyordu ve içerik dikeyde ortalanmıyordu (Tur 3 P1
    // bulgusu). `lg:` kırılımında iki kolona geçilir (sol: sıradaki satır + tarama, sağ: sırada
    // bekleyen liste) ve tüm blok dikeyde ortalanır; 375-1024px arası (operatör el terminali) tek
    // kolon olarak kalır, davranış değişmez.
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center gap-5 md:min-h-[calc(100dvh-3rem)] lg:max-w-3xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/depo/sevkiyat/${deliveryId}`)} className="h-11 px-2 text-muted-foreground">
          <ArrowLeft className="size-4" /> {docNo}
        </Button>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{doneCount}/{lines.length} toplandı</span>
      </div>

      {/* transform: scaleX yerine width — width bir layout property'dir ve her adımda reflow tetikler.
          scaleX yalnızca compositor'da çalışır. 0/N durumunda dolgu tamamen görünmez oluyordu (soluk
          gri bir ayraç sanılıyordu); minimum %2 dolgu bırakılır. Track de bg-muted yerine biraz daha
          belirgin bg-border kullanır ki boş haldeyken de bir "iz" görünsün. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${Math.max(doneCount / lines.length, lines.length ? 0.02 : 0)})` }}
        />
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:items-start lg:gap-6">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sıradaki satır</div>
            <div className="mb-1 text-xl font-semibold">{current.productName}</div>
            <div className="mb-4 font-mono text-sm text-muted-foreground">{current.sku}</div>
            <div className="flex flex-wrap items-center gap-2">
              {current.lotNo ? (
                // LotBadge varsayılan olarak dokunma hedefini yalnızca mobilde büyütür (md:h-5'e geri
                // döner) — toplama ekranı masaüstü genişliğinde açılsa bile hep büyük dokunma hedefi
                // istediğinden md: sınıfları burada açıkça ezilir.
                <LotBadge lotNo={current.lotNo} id={current.lotId ?? undefined} className="h-11 px-3 text-[13px] md:h-11 md:px-3 md:text-[13px]" />
              ) : (
                <span className="text-sm text-muted-foreground">Lotsuz ürün</span>
              )}
              {current.expiryDate ? <ExpiryBadge date={current.expiryDate} /> : null}
            </div>
            {/* Lokasyon kodu (ör. TIRE/MAMUL/R01) tek satırda 2 sütunlu grid'e sığmıyordu (scrollWidth
                134px > clientWidth 128px, 390px'te) ve kırpılıyordu — yanlış raftan toplama riski. Tam
                genişlik tek satıra alındı; miktar altında ayrı bir satırda kalıyor. */}
            <div className="mt-4 space-y-2 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Lokasyon</div>
                <div className="mt-0.5 font-mono text-[15px] font-medium break-all">{current.locationCode ?? '—'}</div>
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
            {/* Eksik/bulunamayan lotta operatörün yapabileceği hiçbir şey yoktu — akış kilitleniyordu
                (Tur 3 P2 bulgusu). İkincil eylem satırı sıradan çıkarır, toplama akışını bozmadan
                devam etmeyi sağlar. */}
            {pendingLines.length > 1 ? (
              <Button variant="ghost" size="sm" className="h-11 w-full text-muted-foreground" onClick={skipCurrent} disabled={pending}>
                Satırı atla — eksik/bulunamadı
              </Button>
            ) : null}
          </div>
        </div>

        {pendingLines.length > 1 ? (
          <div className="mt-5 pt-2 lg:mt-0 lg:pt-0">
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
      </div>
      {lines.length === 0 ? <EmptyState compact title="Toplanacak satır yok" /> : null}
    </div>
  );
}

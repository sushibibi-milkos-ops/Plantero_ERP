'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ScanLine, Package, Tag, MapPin, SearchX, Printer, ArrowLeftRight, Boxes } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LotBadge } from '@/components/lot-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';
import { scanCodeAction } from '../actions';
import type { ScanResult } from '@plantero/core';

/** Son okutmaların özet satırı (yalnızca bu oturumda, sekme kapanınca kaybolur — kalıcı geçmiş
 *  için ayrı bir tablo/sorgu gerekir, bu ekranın kapsamı dışında). */
type HistoryEntry = { key: string; code: string; label: string; icon: typeof Package; found: boolean };

function summarize(res: ScanResult): { label: string; icon: typeof Package; found: boolean } {
  if (res.kind === 'not_found') return { label: res.code, icon: SearchX, found: false };
  if (res.kind === 'product') return { label: res.product.name, icon: Package, found: true };
  if (res.kind === 'lot') return { label: res.lot.lotNo, icon: Tag, found: true };
  return { label: res.location.code, icon: MapPin, found: true };
}

/** Boş/bekleme durumu için sade panel — önceki `EmptyState` (border-dashed) "sürükle-bırak alanı"
 *  izlenimi veriyordu, oysa burada gösterilen bir durum panosu (Tur 4 P1 bulgusu). Dolu, düz
 *  kenarlıklı bir kutuya çevrildi; yükseklik 350px'ten ~160px'e indi. */
function ScanPanel({ icon: Icon, title, description }: { icon: typeof ScanLine; title: string; description: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-6 py-8 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <div className="text-[15px] font-medium">{title}</div>
        <div className="mx-auto max-w-sm text-[13px] text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

export function ScanScreen() {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onScan() {
    const value = code.trim();
    if (!value) return;
    setPending(true);
    const res = await scanCodeAction({ code: value });
    setPending(false);
    setCode('');
    inputRef.current?.focus();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res.data);
    const { label, icon, found } = summarize(res.data);
    setHistory((prev) => [{ key: `${Date.now()}-${value}`, code: value, label, icon, found }, ...prev].slice(0, 5));
  }

  return (
    // Önceki sürüm `mx-auto max-w-md` + `justify-center` ile dikeyde ortalanıyordu — masaüstünde
    // başlıktan önce 289px, mobilde 251px ölü alan bırakıyordu (diğer 11 depo ekranı içeriğe ~100px'te
    // başlıyor, Tur 4 P1 bulgusu). PageHeader'a geçildi, dikey ortalama kaldırıldı; okuma alanı
    // max-w-xl ile sınırlı (bir el terminali sütunu için 672px yeterden fazla, 1440px'te ~1000px ölü
    // alan bırakan max-w-2xl yerine).
    <div className="mx-auto w-full max-w-xl space-y-5">
      <PageHeader title="Tara" description="Barkod, QR, lot ya da lokasyon kodu okutun" className="mb-0" />
      <div className="relative">
        <ScanLine className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onScan(); } }}
          // Placeholder 390px'te input çerçevesine değecek şekilde kırpılıyordu; kısaltıldı ve
          // taşarsa (uzun barkod girilirken) kesilsin diye text-ellipsis eklendi. Odak halkası zaten
          // standart Input bileşeninden geliyor (border-ring + ring-[3px] ring-ring/50) — burada ekstra
          // kenarlık/halka override edilmiyor.
          placeholder="Barkod / lot / lokasyon…"
          disabled={pending}
          className="h-14 pl-11 text-[15px] font-mono text-ellipsis"
        />
      </div>

      {!result ? (
        <ScanPanel icon={ScanLine} title="Okutmayı bekliyor" description="El terminaliyle barkod okutun ya da lot/lokasyon kodunu yazıp Enter'a basın." />
      ) : result.kind === 'not_found' ? (
        <ScanPanel icon={SearchX} title="Sonuç bulunamadı" description={`"${result.code}" için eşleşme yok.`} />
      ) : result.kind === 'product' ? (
        <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Package className="size-5" /></span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{result.product.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{result.product.sku}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Eldeki (tüm depolar)</div><div className="mt-0.5"><QtyCell value={result.onHandQty} className="text-base font-medium" /></div></div>
            <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Değer</div><div className="mt-0.5"><MoneyCell value={result.onHandValue} className="text-base font-medium" /></div></div>
          </div>
          <Button asChild className="h-11 w-full"><Link href="/depo/stok">Stokta gör</Link></Button>
        </div>
      ) : result.kind === 'lot' ? (
        <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Tag className="size-5" /></span>
            <div className="min-w-0">
              <LotBadge lotNo={result.lot.lotNo} status={result.lot.status} />
              <div className="mt-1 truncate text-sm text-muted-foreground">{result.product.name}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {result.quants.length === 0 ? <p className="text-sm text-muted-foreground">Eldeki stok yok</p> : result.quants.map((q) => (
              <div key={q.locationId} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="font-mono text-xs">{q.locationCode}</span>
                <QtyCell value={q.qty} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-11 flex-1"><Link href={`/depo/lotlar/${result.lot.id}`}>Lot detayı</Link></Button>
            <Button asChild className="h-11 flex-1"><Link href={`/depo/etiket?lot=${result.lot.id}`} target="_blank"><Printer className="size-4" /> Etiket</Link></Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MapPin className="size-5" /></span>
            <div className="min-w-0">
              <div className="font-mono font-semibold">{result.location.code}</div>
              <div className="truncate text-sm text-muted-foreground">{result.location.name}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {result.quants.length === 0 ? <p className="text-sm text-muted-foreground">Bu lokasyon boş</p> : result.quants.slice(0, 8).map((q, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{q.productName}{q.lotNo ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{q.lotNo}</span> : null}</span>
                <QtyCell value={q.qty} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-11 flex-1"><Link href="/depo/transfer/yeni"><ArrowLeftRight className="size-4" /> Taşı</Link></Button>
            <Button asChild className="h-11 flex-1"><Link href={`/depo/etiket?loc=${result.location.id}`} target="_blank"><Printer className="size-4" /> Etiket</Link></Button>
          </div>
        </div>
      )}

      {/* Son okutmalar — önceden bu ekranda hiç okutma geçmişi yoktu (Tur 4 P1 bulgusu). Yalnızca bu
          oturumda tutulur (sayfa yenilenince sıfırlanır), kalıcı bir kayıt değildir. */}
      {history.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Son okutmalar</div>
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.key} className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', h.found ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive')}>
                  <h.icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{h.label}</span>
                {!h.found ? <span className="shrink-0 text-xs text-muted-foreground">bulunamadı</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="text-center">
        {/* Önceki `size="sm"` 32px'lik dokunma hedefi veriyordu (44px eşiğinin altında) — operatör
            ekranındaki tek çıkış yolu (Tur 3 P2 bulgusu). */}
        <Button asChild variant="outline" size="lg" className="h-11 w-full sm:w-auto">
          <Link href="/depo/stok"><Boxes className="size-4" /> Stok ekranına dön</Link>
        </Button>
      </div>
    </div>
  );
}

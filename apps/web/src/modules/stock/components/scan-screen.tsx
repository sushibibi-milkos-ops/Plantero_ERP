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
import { EmptyState } from '@/components/empty-state';
import { scanCodeAction } from '../actions';
import type { ScanResult } from '@plantero/core';

export function ScanScreen() {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
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
  }

  return (
    // Önceki sürüm `mx-auto max-w-md` ile sabitlenmişti — 1440px'te ~1000px, 1024px el terminalinde
    // ~570px ölü gri alan kalıyordu (pick-screen.tsx ile aynı kök neden, Tur 3 P1 bulgusu). Sayfa artık
    // kendi başlığını taşır (eski `PageHeader` kaldırıldı — sola dayalı başlık + ortalanmış kart iki
    // farklı eksen yaratıyordu) ve içerikle birlikte dikeyde ortalanır.
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center space-y-5 py-6 md:min-h-[calc(100dvh-3rem)] lg:max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Tara</h1>
        <p className="text-sm text-muted-foreground">Barkod, QR, lot ya da lokasyon kodu okutun</p>
      </div>
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
        <EmptyState icon={ScanLine} title="Okutmayı bekliyor" description="El terminaliyle barkod okutun ya da lot/lokasyon kodunu yazıp Enter'a basın." />
      ) : result.kind === 'not_found' ? (
        <EmptyState icon={SearchX} title="Sonuç bulunamadı" description={`"${result.code}" için eşleşme yok.`} />
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

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Search, ArrowDownToLine, ArrowUpFromLine, Scale, SearchX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { LotBadge } from '@/components/lot-badge';
import { TraceGraph } from '@/components/trace-graph';
import { searchTraceEntitiesAction, listPartnerLotsAction, getTraceForLotAction } from '../actions';
import type { TraceSearchResult, TraceView } from '../queries';

export function TraceSearch({ initialLotId }: { initialLotId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TraceSearchResult[]>([]);
  const [partnerLots, setPartnerLots] = useState<TraceSearchResult[] | null>(null);
  const [view, setView] = useState<TraceView | null>(null);
  // Tur 1 P1 kalite-izlenebilirlik-02: `?lot=` derin bağlantısı çözülemediğinde ekran sessizce
  // "Aramaya başlayın" boş durumuna düşüyordu — arananın ne olduğu, hatta bir arama denendiği bile
  // görünmüyordu. Artık aranan değer saklanır ve görünür bir "Lot bulunamadı" durumu + toast gösterilir.
  const [notFound, setNotFound] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search(value: string) {
    setQ(value);
    setPartnerLots(null);
    setNotFound(null);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchTraceEntitiesAction({ q: value });
      if (res.ok) setResults(res.data);
    });
  }

  function pick(result: TraceSearchResult) {
    if (result.kind === 'lot') { loadLot(result.id); return; }
    startTransition(async () => {
      const res = await listPartnerLotsAction({ partnerId: result.id, kind: result.sub === 'Tedarikçi' ? 'supplier' : 'customer' });
      if (res.ok) setPartnerLots(res.data);
    });
  }

  function loadLot(lotId: string) {
    setPartnerLots(null);
    setNotFound(null);
    startTransition(async () => {
      const res = await getTraceForLotAction({ lotId });
      if (res.ok) {
        setView(res.data);
        // Kanonik URL her zaman gerçek lot UUID'sine geçer — kullanıcı lot NUMARASIYla geldiyse bile
        // (bkz. aşağıdaki not) sonraki paylaşımlar/yenilemeler için kararlı bir bağlantı bırakılır.
        router.replace(`/kalite/izlenebilirlik?lot=${res.data.lot.id}`, { scroll: false });
      } else {
        // Kök neden: parametre lot NUMARASI değil lot UUID'si bekliyordu — kullanıcının elinde tek
        // görünür kimlik olan lot no ile paylaşılan/yapıştırılan her bağlantı burada düşüyordu.
        // `getTraceForLotAction`/`getTraceForLot` artık lot no'yu da çözer (queries.ts); yine de
        // çözülemezse (silinmiş/yanlış değer) sessizce boş durum yerine görünür hata verilir.
        setView(null);
        setNotFound(lotId);
        toast.error(`Lot bulunamadı: ${lotId}`);
      }
    });
  }

  useEffect(() => {
    const lot = initialLotId ?? searchParams.get('lot');
    if (lot) loadLot(lot);
    // Yalnızca ilk yüklemede (URL'den gelen ?lot=) çalışır — `loadLot` her render'da yeniden
    // oluşturulan bir kapanış olduğundan bağımlılığa eklenmesi sonsuz bir arama döngüsü açar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="relative max-w-lg">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => search(e.target.value)} placeholder="Lot no, ürün, müşteri veya tedarikçi ara…" className="h-11 pl-9 text-[13px] md:h-9" />
      </div>

      {q.trim().length >= 2 && !view ? (
        results.length ? (
          <ul className="max-w-lg divide-y divide-border/60 rounded-lg border border-border/60">
            {results.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <button type="button" onClick={() => pick(r)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground uppercase">{r.kind === 'lot' ? 'Lot' : 'Cari'}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : !pending ? (
          <p className="text-sm text-muted-foreground">Sonuç yok.</p>
        ) : null
      ) : null}

      {partnerLots ? (
        <div className="max-w-lg space-y-2">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Lot seçin</div>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {partnerLots.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => loadLot(l.id)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-accent/40">
                  <span className="font-mono">{l.label}</span>
                  <span className="text-xs text-muted-foreground">{l.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-4">
            <LotBadge lotNo={view.lot.lotNo} status={view.lot.status} id={view.lot.id} />
            <StatusBadge status={view.lot.status} kind="lot" />
            <span className="text-sm text-muted-foreground">{view.lot.productName} · {view.lot.sku}</span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setView(null); setNotFound(null); router.replace('/kalite/izlenebilirlik', { scroll: false }); }}>Yeni arama</Button>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <Scale className="size-3.5" /> Miktar dengesi
            </div>
            {/* Tur 1 P1 kalite-kpi-strip-01: `variant="card"` (136px) yerine diğer 12 modülün kullandığı
                Stripe tarzı şerit (80px, çerçevesiz, dikey hairline). */}
            <KpiStripRow>
              <KpiCard title="Giriş" value={Number(view.balance.inQty)} format="qty" variant="strip" />
              <KpiCard title="Tüketim" value={Number(view.balance.consumedQty)} format="qty" variant="strip" />
              <KpiCard title="Sevkiyat" value={Number(view.balance.deliveredQty)} format="qty" variant="strip" />
              <KpiCard title="Fire" value={Number(view.balance.scrapQty)} format="qty" variant="strip" />
              <KpiCard title="Eldeki" value={Number(view.balance.onHandQty)} format="qty" variant="strip" />
            </KpiStripRow>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <ArrowUpFromLine className="size-3.5" /> Geriye izleme (kaynak)
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <TraceGraph nodes={view.backward.nodes} edges={view.backward.edges} rootId={view.backward.rootId} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <ArrowDownToLine className="size-3.5" /> İleri izleme (varış)
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <TraceGraph nodes={view.forward.nodes} edges={view.forward.edges} rootId={view.forward.rootId} />
              </div>
            </div>
          </div>
        </div>
      ) : notFound ? (
        <EmptyState
          icon={SearchX}
          title="Lot bulunamadı"
          description={<>Bağlantıdaki <span className="font-mono">{notFound}</span> değeri bir lot numarasına veya kimliğine karşılık gelmiyor — lot silinmiş ya da bağlantı hatalı olabilir. Yukarıdan yeniden arayın.</>}
        />
      ) : !partnerLots && q.trim().length < 2 ? (
        <EmptyState icon={Search} title="Aramaya başlayın" description="Lot no, ürün adı, müşteri veya tedarikçi girin — geri/ileri izlenebilirlik grafiği ve miktar dengesi burada görünür." />
      ) : null}
    </div>
  );
}

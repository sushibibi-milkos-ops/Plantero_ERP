'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DOCUMENT_TYPE_LABELS, documentHref, type StatusKind } from '@/lib/status';
import { formatDate, formatMoney } from '@/lib/format';
import { StatusBadge } from './status-badge';

/** `getChain()` çıktısındaki düğüm biçimi (core/documents/chain) */
export type ChainNode = {
  type: string;
  id: string;
  docNo: string;
  status?: string | null;
  date?: Date | string | null;
  amount?: string | number | null;
  partnerName?: string | null;
};

const TYPE_TO_KIND: Record<string, StatusKind> = {
  opportunity: 'opportunity',
  quotation: 'sales_order',
  sales_order: 'sales_order',
  delivery: 'delivery',
  invoice: 'invoice',
  credit_note: 'invoice',
  payment: 'payment',
  purchase_order: 'purchase_order',
  receipt: 'receipt',
  transfer: 'transfer',
  stock_count: 'count',
  work_order: 'work_order',
  quality_check: 'qc',
  recall: 'recall',
  export_shipment: 'export',
  maintenance_order: 'maintenance',
  journal_entry: 'journal_entry',
  bank_transaction: 'bank_tx',
};

function ChainCard({ node, current }: { node: ChainNode; current: boolean }) {
  const href = documentHref(node.type, node.id);
  return (
    <Link
      href={href}
      data-pressable
      aria-current={current ? 'true' : undefined}
      className={cn(
        // w-[78vw] md:w-44: mobilde kart genişliği viewport'un ~%78'i — bir sonraki kartın kenarı
        // her zaman ~22% "peek" olarak görünür kalır, bu da kaydırılabilir olduğunu ima eder (Tur 5
        // P2 bulgusu — önceki sabit w-44, 390px'te ~2.2 kart sığdırıp kaydırma ipucusuz duruyordu).
        'flex w-[78vw] shrink-0 snap-start flex-col gap-1.5 rounded-lg border bg-card p-2.5 text-left md:w-44',
        current ? 'border-primary/50 ring-2 ring-primary/15' : 'border-border/70 hover:border-border hover:bg-accent/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {DOCUMENT_TYPE_LABELS[node.type] ?? node.type}
        </span>
        {node.status ? <StatusBadge status={node.status} kind={TYPE_TO_KIND[node.type]} dot={false} className="h-4 px-1.5 text-[10px]" /> : null}
      </div>
      <div className="code truncate text-[13px] font-medium">{node.docNo}</div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{node.date ? formatDate(node.date) : ''}</span>
        {node.amount !== null && node.amount !== undefined ? <span className="num">{formatMoney(node.amount)}</span> : null}
      </div>
      {node.partnerName ? <div className="truncate text-[11px] text-muted-foreground">{node.partnerName}</div> : null}
    </Link>
  );
}

/**
 * Belge zinciri: kronolojik sırada tek satırlık yatay akış (yukarı akış → mevcut belge → aşağı akış),
 * kartlar arasında '›' ayracı, gerekirse yatay kaydırma. `getChain()` upstream'i mevcut belgeye en
 * yakından en uzağa sıralar (depth artan) — ekranda soldan sağa kronolojik okunması için ters çevrilir
 * (ör. FIRSAT → TEKLİF → SİPARİŞ → İRSALİYE(mevcut) → FATURA → TAHSİLAT).
 */
export function DocumentChain({
  upstream,
  current,
  downstream,
  className,
}: {
  upstream: ChainNode[];
  current: ChainNode;
  downstream: ChainNode[];
  className?: string;
}) {
  const Arrow = () => <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/60" aria-hidden />;
  const chronologicalUpstream = [...upstream].reverse();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Kök neden (Tur 4 P2 shell-document-chain-current-clip-01): yatay kaydırıcı mount'ta her zaman
    // sola dayalı açılıyordu — upstream düğüm sayısı fazlaysa AKTİF (mevcut görüntülenen) belge kartı
    // sağdan kırpık geliyordu; kullanıcı baktığı belgeyi ilk boyamada tam göremiyordu. `scrollIntoView`
    // animasyonsuz (`behavior:'auto'` — konumlandırma, giriş animasyonu değil) yalnızca gerektiği kadar
    // (`inline:'nearest'`) kaydırır; zaten görünürdeyse hiçbir şey yapmaz. `block:'nearest'` sayfa
    // düzeyinde dikey kaydırmayı engeller (yalnızca kartın kendi yatay kaydırıcısı hareket eder).
    currentRef.current?.scrollIntoView({ behavior: 'auto', inline: 'nearest', block: 'nearest' });
  }, []);

  return (
    // scroll-fade-x + snap-x: mobilde sert kesiliyor, kaydırılabilir olduğuna dair hiçbir ipucu yoktu
    // (fade/snap/peek yok) — kanban-board.tsx aynı sorunu bu ikisiyle çözmüştü (Tur 3 P1).
    // --scroll-fade-bg: var(--background) — DocumentChain'in tüm kullanım yerleri (sipariş/teklif/
    // mal kabul/sevkiyat/iş emri detayı) bu şeridi kart içinde değil doğrudan sayfa zemininde
    // render eder; scroll-fade-x'in varsayılanı var(--card) (beyaz) olduğundan açık temada zeminle
    // (var(--background), #fafafa) eşleşmiyor ve soldurma pratikte görünmüyordu (Tur 4 P2 bulgusu).
    <div
      // Kök neden (Tur 5 P2): yalnızca `snap-x` (proximity) — momentum kaydırma bir kartın TAM
      // ortasında durabiliyordu, kırpma/kaydırma göstergesi olmadan bozuk render izlenimi veriyordu.
      // `snap-mandatory` kaydırmanın her zaman bir kart sınırında durmasını zorunlu kılar.
      className={cn('scrollbar-thin scroll-fade-x -mx-1 snap-x snap-mandatory overflow-x-auto px-1 py-1', className)}
      style={{ '--scroll-fade-bg': 'var(--background)' } as CSSProperties}
      role="navigation"
      aria-label="Belge zinciri"
      ref={scrollerRef}
    >
      <div className="flex items-center gap-2">
        {chronologicalUpstream.map((n) => (
          <div key={`${n.type}-${n.id}`} className="flex items-center gap-2">
            <ChainCard node={n} current={false} />
            <Arrow />
          </div>
        ))}
        <div ref={currentRef}>
          <ChainCard node={current} current />
        </div>
        {downstream.length ? (
          downstream.map((n) => (
            <div key={`${n.type}-${n.id}`} className="flex items-center gap-2">
              <Arrow />
              <ChainCard node={n} current={false} />
            </div>
          ))
        ) : (
          // Önceden kartsız, hizasız düz metindi — zincirdeki kartlarla (w-44, aynı dikey konum) aynı
          // ölçüde kesikli çerçeveli bir "boş" kart, akışın bittiğini görsel olarak da belirtir.
          <div className="flex w-[78vw] shrink-0 snap-start items-center justify-center self-stretch rounded-lg border border-dashed border-border/70 p-2.5 text-center text-[11px] text-muted-foreground md:w-44">
            Devam belgesi yok
          </div>
        )}
      </div>
    </div>
  );
}

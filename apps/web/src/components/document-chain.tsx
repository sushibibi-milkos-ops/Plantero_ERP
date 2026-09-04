'use client';

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
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

// SSR sırasında useLayoutEffect konsola uyarı basar (DOM yok) — istemci tarafında boyamadan ÖNCE
// (titreşimsiz) kaydırma konumunu yazmak için gerçek layout effect, sunucuda no-op'a düşer
// (mobile-cards.tsx'teki useIsoLayoutEffect ile aynı desen).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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

  useIsoLayoutEffect(() => {
    // Kök neden (Tur 4 P2 shell-document-chain-current-clip-01, yeniden açıldı Tur 18
    // shell-document-chain-current-clip-02): yatay kaydırıcı mount'ta her zaman sola dayalı
    // açılıyordu — upstream düğüm sayısı fazlaysa AKTİF (mevcut görüntülenen) belge kartı sağdan
    // kırpık geliyordu. Tur 17'de eklenen `currentRef.current?.scrollIntoView(...)` (behavior:'auto')
    // ETKİSİZDİ, Tur 18'in İLK denemesi (`el.scrollLeft` DOĞRUDAN, keyfi bir piksel hedefine —
    // "sağ kenar + 8px pay") de ETKİSİZ ÇIKTI: `snap-x snap-mandatory` yalnızca kaydırma
    // JESTLERİNDEN sonra değil, `scroll-snap-type` her devrede olduğunda (sınıf zaten mount'ta
    // uygulanmış olsa da) geçerli DEĞİLSE en yakın GEÇERLİ snap noktasına döner — keyfi bir hedef
    // hiçbir zaman geçerli bir nokta OLMADIĞINDAN tarayıcı onu listenin BAŞINA (scrollLeft≈0) geri
    // düzeltiyordu (1440x900'de ölçüldü: hedef 68 yazıldı, final scrollLeft=4). Kalıcı çözüm: hedef
    // olarak yalnızca GEÇERLİ bir snap noktası (her kartın kendi `.snap-start` sol kenarı) seçilir —
    // AKTİF kartı hâlâ TAM gösteren (`right ≤ target + clientWidth`) noktalar arasından en SAĞDAKİ
    // (önceki belgelerden mümkün olduğunca fazlasını bağlamda tutan). Bu, zaten "kendi en yakın
    // geçerli snap noktası" olduğundan tarayıcı bunu bir daha ASLA geri almaz.
    const el = scrollerRef.current;
    const cur = currentRef.current;
    if (!el || !cur) return;
    // AKTİF kartın sağ kenarının kaydırıcının görünür sağ kenarını GEÇMEMESİ için gereken EN KÜÇÜK
    // scrollLeft değeri: scrollLeft + clientWidth ≥ right ⟺ scrollLeft ≥ right - clientWidth.
    const minLeft = cur.offsetLeft + cur.offsetWidth - el.clientWidth;
    const snapPoints = Array.from(el.querySelectorAll<HTMLElement>('.snap-start')).map((n) => n.offsetLeft);
    // Bu eşiği KARŞILAYAN (≥) geçerli snap noktaları arasından EN KÜÇÜĞÜ seçilir — bu hem AKTİF
    // kartı tam gösterir hem de öncesindeki belgelerden mümkün olduğunca fazlasını bağlamda tutar.
    const candidates = snapPoints.filter((p) => p >= minLeft - 0.5);
    const target = candidates.length ? Math.min(...candidates) : cur.offsetLeft;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
  }, []);

  return (
    // scroll-fade-x + snap-x: mobilde sert kesiliyor, kaydırılabilir olduğuna dair hiçbir ipucu yoktu
    // (fade/snap/peek yok) — kanban-board.tsx aynı sorunu bu ikisiyle çözmüştü (Tur 3 P1).
    // --scroll-fade-bg: var(--background) — DocumentChain'in tüm kullanım yerleri (sipariş/teklif/
    // mal kabul/sevkiyat/iş emri detayı) bu şeridi kart içinde değil doğrudan sayfa zemininde
    // render eder; scroll-fade-x'in varsayılanı var(--card) (beyaz) olduğundan açık temada zeminle
    // (var(--background), #fafafa) eşleşmiyor ve soldurma pratikte görünmüyordu (Tur 4 P2 bulgusu).
    <div
      className={cn(
        // relative: `cur.offsetLeft` / `.snap-start` öğelerinin `offsetLeft`i (yukarıdaki effect)
        // yalnızca EN YAKIN KONUMLANDIRILMIŞ atanın (offsetParent) padding kutusuna göre doğru sonuç
        // verir — bu kaydırıcı önceden konumsuzdu, offsetParent DOM ağacında çok daha yukarıya (ör.
        // <body>) sıçrayıp ölçümü anlamsızlaştırırdı.
        'relative scrollbar-thin scroll-fade-x -mx-1 overflow-x-auto px-1 py-1',
        // Kök neden (Tur 5 P2): yalnızca `snap-x` (proximity) — momentum kaydırma bir kartın TAM
        // ortasında durabiliyordu, kırpma/kaydırma göstergesi olmadan bozuk render izlenimi
        // veriyordu. `snap-mandatory` kaydırmanın her zaman bir kart sınırında durmasını zorunlu
        // kılar; yukarıdaki effect artık hedefini HER ZAMAN geçerli bir snap noktasından seçtiği
        // için (Tur 18 P1 shell-document-chain-current-clip-02) bu sınıfın mount'tan itibaren
        // devrede olması güvenli — tarayıcının "düzelteceği" bir uyumsuzluk hiç oluşmuyor.
        'snap-x snap-mandatory',
        className,
      )}
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

import Link from 'next/link';
import { Tag, Factory, PackageCheck, Truck, Building2, Boxes, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatQty } from '@/lib/format';
import { StatusBadge } from './status-badge';

/** `traceBackward/traceForward` çıktısı (core/lots/trace) */
export type TraceNode = {
  id: string;
  kind: 'lot' | 'work_order' | 'receipt' | 'delivery' | 'partner' | 'quant';
  label: string;
  sub?: string | null;
  qty?: string | number | null;
  uom?: string | null;
  status?: string | null;
  href?: string | null;
};
export type TraceEdge = { from: string; to: string; label?: string | null };

/** `quant` (Eldeki stok) düğümünün `status` alanı gerçek bir belge durumu DEĞİL — `traceForward`
 *  (packages/core/src/lots/trace.ts) buraya lokasyonun `usage` değerini (ör. 'internal', 'transit')
 *  koyar. Kök neden (Tur 11 P2): `<StatusBadge status={node.status} kind={undefined}>` bu değeri
 *  `lib/status.ts`'in GENERIC sözlüğünde arıyordu — 'internal'/'transit' orada yok, her render'da
 *  konsol uyarısı basıp boş "—" gösteriyordu. Bu, `modules/stock/labels.ts` ve
 *  `modules/masterdata/product-labels.ts`'teki `LOCATION_USAGE_LABELS` sözlüğüyle AYNI değer kümesi
 *  (aynı enum, `locations.usage`) — ama bu bileşen paylaşılan `components/` altında olduğu için bir
 *  modülün yerel sözlüğüne bağımlı olmamalı; kendi küçük kopyası burada tutulur (StatusBadge zaten
 *  `label` verilince sözlüğe hiç bakmıyor — Tur 5 P1 düzeltmesindeki desenin aynısı). */
const QUANT_USAGE_LABELS: Record<string, string> = {
  internal: 'Depo',
  quarantine: 'Karantina',
  rejected: 'Red',
  production: 'Üretim',
  supplier: 'Tedarikçi (sanal)',
  customer: 'Müşteri (sanal)',
  inventory_loss: 'Sayım farkı',
  scrap: 'Hurda',
  transit: 'Transit',
  view: 'Görünüm (gruplama)',
};

const KIND_META: Record<TraceNode['kind'], { icon: LucideIcon; label: string; cls: string }> = {
  lot: { icon: Tag, label: 'Lot', cls: 'text-primary bg-primary/10' },
  work_order: { icon: Factory, label: 'İş emri', cls: 'text-info bg-info/10' },
  receipt: { icon: PackageCheck, label: 'Mal kabul', cls: 'text-success bg-success/12' },
  delivery: { icon: Truck, label: 'Sevkiyat', cls: 'text-[oklch(0.55_0.15_300)] bg-[oklch(0.55_0.15_300)]/10' },
  partner: { icon: Building2, label: 'Cari', cls: 'text-muted-foreground bg-muted' },
  quant: { icon: Boxes, label: 'Eldeki stok', cls: 'text-foreground/70 bg-muted' },
};

function NodeRow({ node, depth }: { node: TraceNode; depth: number }) {
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;
  const content = (
    <div
      className={cn(
        'flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1 text-[13px]',
        node.href && 'hover:bg-accent/60',
        depth === 0 && 'bg-accent/40 font-medium',
      )}
    >
      <span className={cn('grid size-6 shrink-0 place-items-center rounded-md', meta.cls)}>
        <Icon className="size-3.5" strokeWidth={1.75} />
      </span>
      <span className="text-[11px] text-muted-foreground">{meta.label}</span>
      <span className={cn('truncate', node.kind === 'lot' && 'font-mono')}>{node.label}</span>
      {node.sub ? <span className="hidden truncate text-xs text-muted-foreground sm:inline">{node.sub}</span> : null}
      <span className="ml-auto flex items-center gap-2">
        {node.qty !== null && node.qty !== undefined ? <span className="num text-xs">{formatQty(node.qty, node.uom)}</span> : null}
        {node.status ? (
          node.kind === 'quant' ? (
            <StatusBadge status={node.status} label={QUANT_USAGE_LABELS[node.status] ?? node.status} tone="neutral" />
          ) : (
            <StatusBadge status={node.status} kind={node.kind === 'lot' ? 'lot' : undefined} />
          )
        ) : null}
      </span>
    </div>
  );
  return node.href ? (
    <Link href={node.href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

/**
 * İzlenebilirlik ağacı: kök düğümden kenarları izleyerek iç içe liste çizer.
 * Döngü koruması var; erişilemeyen düğümler "Bağlantısız" başlığı altında listelenir.
 */
export function TraceGraph({
  nodes,
  edges,
  rootId,
  className,
}: {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rootId: string;
  className?: string;
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Kök neden (Tur 20 P0, /kalite/izlenebilirlik + /depo/lotlar/[id]): `traceForward`
  // (packages/core/src/lots/trace.ts) kenarları KÖKTEN dışa doğru üretir (from: kök → to: torun),
  // ama `traceBackward` bunun TERSİNİ üretir — her kenar bir atadan köke DOĞRU kurulur
  // (from: kaynak/ata → to: kök/torun-a-daha-yakın-düğüm), çünkü fonksiyon "kökten yukarı" değil
  // "yaprak → kök" sırasıyla `g.link(...)` çağırıyor (ör. `g.link(cNid, woNid)`,
  // `g.link(woNid, lotNid /* kök */)`). Bu bileşen `e.from → e.to` ile SABİT bir children haritası
  // kuruyordu; bu yalnızca forward grafiklerde (kök = kaynak) doğru sonuç veriyordu. Backward
  // grafikte kök hiçbir zaman bir kenarın `from`'u olmuyor (yalnızca `to`) — bu, iki yönü ayırt
  // etmek için güvenilir bir imza: kök en az bir kenarda görülüyor ama hiçbirinde kaynak değilse,
  // graf ters yönde üretilmiş demektir ve children haritası `e.to → e.from` ile kurulmalı.
  // (Forward grafikte kök tam tersi: en az bir kenarda HER ZAMAN kaynaktır çünkü ilk kenarlar hep
  // kökten çıkar.) Boş graf (hiç kenar yok, ör. hareketsiz bir lot) her iki yönde de zararsız —
  // kök tek başına, torunsuz render edilir.
  const rootIsSource = edges.some((e) => e.from === rootId);
  const rootIsTarget = edges.some((e) => e.to === rootId);
  const reversed = !rootIsSource && rootIsTarget;
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const parent = reversed ? e.to : e.from;
    const child = reversed ? e.from : e.to;
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(child);
  }
  const seen = new Set<string>();

  const render = (id: string, depth: number): React.ReactNode => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return null;
    seen.add(id);
    const kids = children.get(id) ?? [];
    return (
      <li key={id}>
        <NodeRow node={node} depth={depth} />
        {kids.length ? (
          <ul className="ml-[15px] border-l border-border/70 pl-3">{kids.map((k) => render(k, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  const tree = render(rootId, 0);
  const orphans = nodes.filter((n) => !seen.has(n.id));

  return (
    <div className={cn('text-sm', className)}>
      {tree ? <ul>{tree}</ul> : <p className="text-muted-foreground">Kök düğüm bulunamadı.</p>}
      {orphans.length ? (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bağlantısız</div>
          <ul>
            {orphans.map((n) => (
              <li key={n.id}>
                <NodeRow node={n} depth={1} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

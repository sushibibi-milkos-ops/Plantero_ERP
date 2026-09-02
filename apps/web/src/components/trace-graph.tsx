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
        {node.status ? <StatusBadge status={node.status} kind={node.kind === 'lot' ? 'lot' : undefined} /> : null}
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
  const children = new Map<string, string[]>();
  for (const e of edges) (children.get(e.from) ?? children.set(e.from, []).get(e.from)!).push(e.to);
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

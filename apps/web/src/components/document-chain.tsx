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
        'flex w-44 shrink-0 flex-col gap-1.5 rounded-lg border bg-card p-2.5 text-left',
        current ? 'border-primary/50 ring-2 ring-primary/15' : 'border-border/70 hover:border-border hover:bg-accent/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {DOCUMENT_TYPE_LABELS[node.type] ?? node.type}
        </span>
        {node.status ? <StatusBadge status={node.status} kind={TYPE_TO_KIND[node.type]} dot={false} className="h-4 px-1.5 text-[10px]" /> : null}
      </div>
      <div className="truncate font-mono text-[13px] font-medium">{node.docNo}</div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{node.date ? formatDate(node.date) : ''}</span>
        {node.amount !== null && node.amount !== undefined ? <span className="num">{formatMoney(node.amount)}</span> : null}
      </div>
      {node.partnerName ? <div className="truncate text-[11px] text-muted-foreground">{node.partnerName}</div> : null}
    </Link>
  );
}

/**
 * Belge zinciri: yukarı akış → mevcut belge → aşağı akış, yatay kaydırılabilir.
 * Birden çok aşağı akış belgesi olduğunda dikey yığılır.
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
  const Column = ({ nodes }: { nodes: ChainNode[] }) => (
    <div className="flex flex-col gap-2">
      {nodes.map((n) => (
        <ChainCard key={`${n.type}-${n.id}`} node={n} current={false} />
      ))}
    </div>
  );

  // Yukarı akışı belge tipine göre sırala (teklif → sipariş → irsaliye …)
  return (
    <div className={cn('scrollbar-thin -mx-1 overflow-x-auto px-1 py-1', className)} role="navigation" aria-label="Belge zinciri">
      <div className="flex items-start gap-2">
        {upstream.length ? (
          <>
            <Column nodes={upstream} />
            <Arrow />
          </>
        ) : null}
        <ChainCard node={current} current />
        {downstream.length ? (
          <>
            <Arrow />
            <Column nodes={downstream} />
          </>
        ) : (
          <div className="ml-2 self-center text-xs text-muted-foreground">Devam belgesi yok</div>
        )}
      </div>
    </div>
  );
}

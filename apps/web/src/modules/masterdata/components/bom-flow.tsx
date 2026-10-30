'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Network, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPct, formatQty } from '@/lib/format';
import { EmptyState } from '@/components/empty-state';
import { MoneyCell } from '@/components/money-cell';
import { StatusBadge } from '@/components/status-badge';
import { flattenBomTree, type BomNodeKind, type BomTree, type BomTreeNode } from '../bom-tree';
import { BOM_STATUS_LABELS } from '../product-labels';
import { NODE_KIND_LABELS, iconForNode, stepsFor } from '../bom-flow-model';

/**
 * Ürün ağacı akış şeması.
 *
 * Masaüstü: soldan sağa — bileşenler → süreç → (yarı mamul → süreç →) mamul. Mobil: yukarıdan aşağıya.
 * Her "montaj" (reçetesi olan düğüm: kök + genişletilmiş yarı mamuller) = girdiler | süreç | ürün; yarı mamul
 * girdisi kendi montajıdır, bu yüzden aynı bileşen özyinelemeli çizilir. Çizgiler saf CSS (ölçüm/SVG yok):
 * girdi sütununda her satır kendi saplamasını ve kısmi bir omurga çizgisini taşır.
 */

const LINE = 'bg-[var(--flow-line)]';
const LINE_BORDER = 'border-[var(--flow-line)]';

/** Düğüm tipi → ikon zemini (anlamsal yeşil kullanılmaz; yeşil yalnızca durum rengidir) */
const TILE_TONE: Record<BomNodeKind, string> = {
  raw: 'bg-chart-3/15 text-[color-mix(in_oklch,var(--chart-3)_62%,var(--foreground))]',
  packaging: 'bg-chart-5/12 text-[color-mix(in_oklch,var(--chart-5)_78%,var(--foreground))]',
  semi: 'bg-info/12 text-info',
  finished: 'bg-foreground text-background',
};

type Ctx = {
  collapsed: ReadonlySet<string>;
  toggle: (key: string) => void;
  linkRoot: boolean;
};

export function BomFlow({
  tree,
  linkRoot = false,
  canManage = true,
  className,
}: {
  tree: BomTree | null;
  /** Kök mamul kartı ürün kartına bağlansın mı (reçete detayında true; ürün kartında zaten oradayız) */
  linkRoot?: boolean;
  canManage?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Masaüstünde şema kapsayıcıdan geniş çıkarsa sonuç (mamul) görünür olsun: ilk açılışta sona kaydır.
  // Mobil dikey akıştır, kaydırma yok.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && window.matchMedia('(min-width: 768px)').matches && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [tree]);

  const collapsibleKeys = useMemo(
    () => (tree ? flattenBomTree(tree.root).filter((n) => n.depth > 0 && n.bom && n.children.length > 0).map((n) => n.key) : []),
    [tree],
  );

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (!tree) {
    return (
      <EmptyState
        compact
        icon={Network}
        title="Reçete tanımlı değil"
        description="Ürün ağacı, aktif bir reçeteden (BOM) çizilir."
        action={
          canManage ? (
            <Link
              href="/ana-veri/receteler"
              className="inline-flex h-11 items-center rounded-md border border-border/70 px-3 text-[13px] font-medium transition-transform duration-150 ease-out hover:bg-accent active:scale-[0.97] md:h-8"
            >
              Reçete oluştur
            </Link>
          ) : undefined
        }
      />
    );
  }

  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every((k) => collapsed.has(k));
  const levels = tree.maxDepth + 1;
  const root = tree.root;

  return (
    <section
      data-testid="bom-flow"
      data-node-count={tree.nodeCount}
      data-line-count={tree.lineCount}
      aria-label="Ürün ağacı"
      className={cn('overflow-hidden rounded-lg border border-border/70 bg-card', className)}
      style={{ '--flow-line': 'color-mix(in oklch, var(--border), var(--foreground) 16%)' } as CSSProperties}
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-1.5 md:min-h-10">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted-foreground">
          {root.bom ? <span className="font-mono text-foreground/80">{root.bom.code}</span> : null}
          {root.bom && root.bom.status !== 'active' ? (
            <StatusBadge status={root.bom.status} label={BOM_STATUS_LABELS[root.bom.status] ?? root.bom.status} kind="bom" />
          ) : null}
          <span>
            {tree.lineCount} satır · {levels} seviye
          </span>
        </div>
        {collapsibleKeys.length > 0 ? (
          <button
            type="button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys))}
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97] md:h-8"
          >
            {allCollapsed ? <ChevronsUpDown className="size-3.5" strokeWidth={1.75} /> : <ChevronsDownUp className="size-3.5" strokeWidth={1.75} />}
            {allCollapsed ? 'Tümünü genişlet' : 'Tümünü daralt'}
          </button>
        ) : null}
      </div>

      <div ref={scrollerRef} className="scroll-fade-x overflow-x-auto overscroll-x-contain p-3 md:p-4">
        <div className="md:w-max">
          <Assembly node={root} parentLine={null} isRoot ctx={{ collapsed, toggle, linkRoot }} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Montaj: girdiler → süreç → ürün                                      */
/* ------------------------------------------------------------------ */

function Assembly({
  node,
  parentLine,
  isRoot = false,
  ctx,
}: {
  node: BomTreeNode;
  parentLine: BomTreeNode['line'];
  isRoot?: boolean;
  ctx: Ctx;
}) {
  const inputs = node.children.filter((c) => !c.isByproduct);
  const byproducts = node.children.filter((c) => c.isByproduct);
  const hasSemiChild = inputs.some((c) => c.bom);
  const line = node.line ?? parentLine;
  const steps = stepsFor(line?.code, node.product.type === 'semi' ? 'semi' : 'finished', hasSemiChild);
  const open = isRoot || !ctx.collapsed.has(node.key);
  const hidden = node.children.length;
  const descendantCount = flattenBomTree(node).length - 1;

  return (
    <div className="flex flex-col md:flex-row md:items-center">
      {/* Daralt/genişlet: grid 0fr↔1fr — mobilde satır, masaüstünde sütun daralır (azaltılmış harekette anında) */}
      <div
        data-open={open}
        inert={!open}
        aria-hidden={!open}
        className={cn(
          'grid grid-cols-[1fr] grid-rows-[1fr] transition-[grid-template-rows,grid-template-columns,opacity] duration-200 ease-out',
          'data-[open=false]:opacity-0 max-md:data-[open=false]:grid-rows-[0fr] md:data-[open=false]:grid-cols-[0fr]',
        )}
      >
        <div className="min-h-0 min-w-0 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center">
            {inputs.length > 0 ? (
              <>
                <div className="flex flex-col">
                  {inputs.map((child, i) => (
                    <InputItem key={child.key} node={child} first={i === 0} last={i === inputs.length - 1} single={inputs.length === 1} parentLine={line} ctx={ctx} />
                  ))}
                </div>
                <Connector />
              </>
            ) : null}
            <ProcessCard line={line} steps={steps} cycleMinutes={node.bom?.cycleMinutes ?? null} />
            <Connector />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {byproducts.length > 0 ? <ByproductList nodes={byproducts} ghost /> : null}
        <NodeCard
          node={node}
          href={isRoot && !ctx.linkRoot ? null : `/ana-veri/urunler/${node.product.id}`}
          toggle={!isRoot && hidden > 0 ? { open, onToggle: () => ctx.toggle(node.key), hiddenCount: descendantCount } : null}
        />
        {byproducts.length > 0 ? <ByproductList nodes={byproducts} /> : null}
      </div>
    </div>
  );
}

function InputItem({
  node,
  first,
  last,
  single,
  parentLine,
  ctx,
}: {
  node: BomTreeNode;
  first: boolean;
  last: boolean;
  single: boolean;
  parentLine: BomTreeNode['line'];
  ctx: Ctx;
}) {
  return (
    <div className="relative flex py-0.5 md:justify-end md:py-1 md:pr-5">
      <div className={cn('w-full md:w-auto', node.bom && 'max-md:ml-2 max-md:border-l max-md:pl-3', node.bom && LINE_BORDER)}>
        {node.bom ? <Assembly node={node} parentLine={parentLine} ctx={ctx} /> : <NodeCard node={node} href={`/ana-veri/urunler/${node.product.id}`} />}
      </div>
      {/* Masaüstü: sapla → omurga. Omurga ilk satırda ortadan aşağı, son satırda yukarıdan ortaya, ara satırlarda tam boy */}
      <span aria-hidden className={cn('absolute top-1/2 right-0 hidden h-px w-5 md:block', LINE)} />
      {!single ? (
        <span
          aria-hidden
          className={cn('absolute right-0 hidden w-px md:block', LINE, first ? 'top-1/2' : 'top-0', last ? 'bottom-1/2' : 'bottom-0')}
        />
      ) : null}
    </div>
  );
}

/** Aşamalar arası bağlantı: masaüstünde yatay çizgi + ince ok, mobilde dikey */
function Connector() {
  return (
    <>
      <span aria-hidden className="hidden w-5 shrink-0 items-center self-center md:flex">
        <span className={cn('h-px flex-1', LINE)} />
        <span className={cn('-ml-[5px] size-[5px] rotate-45 border-t border-r', LINE_BORDER)} />
      </span>
      <span aria-hidden className="flex h-5 shrink-0 flex-col items-center self-center md:hidden">
        <span className={cn('w-px flex-1', LINE)} />
        <span className={cn('-mt-[5px] size-[5px] rotate-45 border-r border-b', LINE_BORDER)} />
      </span>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Süreç düğümü                                                         */
/* ------------------------------------------------------------------ */

function ProcessCard({
  line,
  steps,
  cycleMinutes,
}: {
  line: BomTreeNode['line'];
  steps: ReturnType<typeof stepsFor>;
  cycleMinutes: number | null;
}) {
  return (
    <div
      data-testid="bom-process"
      className="w-full shrink-0 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 md:w-[156px]"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        {line ? (
          <>
            <span className="font-mono font-medium text-foreground/80">{line.code}</span>
            <span className="truncate" title={line.name}>
              {line.name}
            </span>
          </>
        ) : (
          <span>Süreç</span>
        )}
      </div>
      <ol className="mt-1.5">
        {steps.map((s, i) => {
          const Icon = iconForNode({ kind: 'process', key: s.key, label: s.label });
          return (
            <li key={s.key} className="relative flex min-h-8 items-center gap-2 py-1 md:min-h-0">
              <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="text-[12.5px] text-foreground/90">{s.label}</span>
              {i < steps.length - 1 ? <span aria-hidden className={cn('absolute bottom-[-4px] left-[10.5px] h-2 w-px', LINE)} /> : null}
            </li>
          );
        })}
      </ol>
      {cycleMinutes ? <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">Parti süresi {formatQty(cycleMinutes, 'dk')}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Malzeme / ürün düğümü                                                */
/* ------------------------------------------------------------------ */

function nodeFlag(node: BomTreeNode): { label: string; title: string } | null {
  if (node.cycle) return { label: 'Döngü', title: 'Bu ürün zincirde tekrar ediyor; alt ağaç açılmadı.' };
  if (node.truncated) return { label: 'Derinlik sınırı', title: 'Derinlik sınırına ulaşıldı; alt ağaç açılmadı.' };
  if (node.missingBom) return { label: 'Reçete yok', title: 'Üretilen ürün ama aktif reçetesi tanımlı değil.' };
  return null;
}

function NodeCard({
  node,
  href,
  toggle,
}: {
  node: BomTreeNode;
  href: string | null;
  toggle?: { open: boolean; onToggle: () => void; hiddenCount: number } | null;
}) {
  const Icon = iconForNode({ kind: 'material', type: node.product.type, name: node.product.name });
  const flag = nodeFlag(node);
  const fire = Number(node.scrapPct) > 0;
  const hasCost = node.birimMaliyet !== null && Number(node.birimMaliyet) > 0;
  const fullName = `${node.product.name} (${node.product.sku})`;

  const body = (
    <>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', TILE_TONE[node.product.type])}>
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[17px] font-medium break-words" title={fullName}>
            {node.product.name}
          </span>
          {hasCost ? (
            <span className="shrink-0 leading-[17px]" title={`Birim maliyet (${node.qtyUom})`}>
              <MoneyCell value={node.birimMaliyet} digits={Number(node.birimMaliyet) < 1 ? 4 : 2} className="text-[11px] text-foreground/80" />
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-4 text-muted-foreground">
          <span className="num text-foreground/80">{formatQty(node.qty, node.qtyUom, { maxDigits: 4 })}</span>
          {fire ? (
            <span className="num text-warning" title={`Fire ${formatPct(node.scrapPct, 1)}`}>
              +{formatPct(node.scrapPct, 1)} fire
            </span>
          ) : null}
          <span className="rounded-full bg-muted px-1.5 text-[10px] leading-4">{NODE_KIND_LABELS[node.product.type]}</span>
          {flag ? (
            <span title={flag.title} className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 text-[10px] leading-4 text-[oklch(0.5_0.14_70)] dark:text-warning">
              <TriangleAlert className="size-2.5" strokeWidth={2} />
              {flag.label}
            </span>
          ) : null}
          {toggle && !toggle.open ? <span className="text-[10px]">{toggle.hiddenCount} alt düğüm gizli</span> : null}
        </span>
      </span>
    </>
  );

  const bodyClass = 'flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2';

  return (
    <div
      data-testid="bom-node"
      data-depth={node.depth}
      data-kind={node.product.type}
      className={cn(
        'flex w-full items-stretch rounded-lg border border-border/70 bg-card transition-[border-color,background-color] duration-150 ease-out md:w-[224px] md:shrink-0',
        node.product.type === 'finished' && 'border-foreground/25',
        href && 'hover:border-foreground/25',
      )}
    >
      {href ? (
        <Link href={href} prefetch={false} className={cn(bodyClass, 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', toggle && 'rounded-r-none')}>
          {body}
        </Link>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
      {toggle ? (
        <button
          type="button"
          onClick={toggle.onToggle}
          aria-expanded={toggle.open}
          aria-label={toggle.open ? `${node.product.name} alt ağacını daralt` : `${node.product.name} alt ağacını genişlet`}
          title={toggle.open ? 'Alt ağacı daralt' : 'Alt ağacı genişlet'}
          className="grid w-11 shrink-0 place-items-center rounded-r-lg border-l border-border/60 text-muted-foreground outline-none transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:w-9"
        >
          <ChevronDown className={cn('size-4 transition-transform duration-200 ease-out', toggle.open ? 'rotate-90 max-md:rotate-0' : '-rotate-90')} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

/** Yan ürünler çıktıdır, girdi değil: ürün kartının altında küçük satırlar. `ghost`: kartı ortalı tutan görünmez ikiz. */
function ByproductList({ nodes, ghost = false }: { nodes: BomTreeNode[]; ghost?: boolean }) {
  return (
    <ul aria-hidden={ghost || undefined} className={cn('space-y-1', ghost && 'pointer-events-none invisible max-md:hidden')}>
      {nodes.map((n) => {
        const Icon = iconForNode({ kind: 'material', type: n.product.type, name: n.product.name });
        return (
          <li key={n.key} data-testid="bom-node" data-kind={n.product.type} className="flex min-h-7 items-center gap-2 rounded-md border border-dashed border-border/70 px-2 text-[11px] text-muted-foreground md:w-[224px]">
            <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate" title={n.product.name}>
              {n.product.name}
            </span>
            <span className="ml-auto shrink-0">Yan ürün · {formatQty(n.qty, n.qtyUom, { maxDigits: 4 })}</span>
          </li>
        );
      })}
    </ul>
  );
}

import { and, eq, gt, inArray } from 'drizzle-orm';
import {
  stockLots, stockQuants, locations, products, partners, receipts, deliveries, deliveryLines,
  workOrders, workOrderConsumptions, workOrderOutputs, type DbOrTx,
} from '@plantero/db';
import { D, toDb, sum, ZERO, formatQtyTr } from '../money.js';
import { NotFoundError } from '../auth/errors.js';

export type TraceNodeKind = 'lot' | 'work_order' | 'receipt' | 'delivery' | 'partner' | 'quant';

export type TraceNode = {
  id: string;
  kind: TraceNodeKind;
  label: string;
  sub: string | null;
  qty?: string;
  status?: string | null;
  href: string;
  /** Kök lottan uzaklık (0 = kök) */
  depth: number;
};

export type TraceEdge = { from: string; to: string; label?: string; qty?: string };

export type TraceResult = { nodes: TraceNode[]; edges: TraceEdge[]; rootId: string };

const hrefs = {
  lot: (id: string) => `/depo/lotlar/${id}`,
  work_order: (id: string) => `/uretim/is-emirleri/${id}`,
  receipt: (id: string) => `/depo/mal-kabul/${id}`,
  delivery: (id: string) => `/depo/sevkiyat/${id}`,
  partner: (id: string) => `/ana-veri/cariler/${id}`,
  quant: (id: string) => `/depo/stok?lot=${id}`,
};

const nodeId = (kind: TraceNodeKind, id: string) => `${kind}:${id}`;

class Graph {
  nodes = new Map<string, TraceNode>();
  edges: TraceEdge[] = [];
  private edgeKeys = new Set<string>();

  add(node: Omit<TraceNode, 'id'> & { id: string }): string {
    const id = nodeId(node.kind, node.id);
    const existing = this.nodes.get(id);
    if (existing) {
      if (node.depth < existing.depth) existing.depth = node.depth;
      return id;
    }
    this.nodes.set(id, { ...node, id });
    return id;
  }
  has(kind: TraceNodeKind, id: string) { return this.nodes.has(nodeId(kind, id)); }
  link(from: string, to: string, label?: string, qty?: string) {
    const k = `${from}->${to}`;
    if (this.edgeKeys.has(k)) return;
    this.edgeKeys.add(k);
    this.edges.push({ from, to, label, qty });
  }
  result(rootId: string): TraceResult {
    return { nodes: Array.from(this.nodes.values()), edges: this.edges, rootId };
  }
}

async function loadLot(db: DbOrTx, lotId: string) {
  const [row] = await db
    .select({ lot: stockLots, productName: products.name, sku: products.sku, productType: products.type })
    .from(stockLots)
    .innerJoin(products, eq(products.id, stockLots.productId))
    .where(eq(stockLots.id, lotId))
    .limit(1);
  return row ?? null;
}

const lotNode = (r: NonNullable<Awaited<ReturnType<typeof loadLot>>>, depth: number, qty?: string): Omit<TraceNode, 'id'> & { id: string } => ({
  id: r.lot.id,
  kind: 'lot',
  label: r.lot.lotNo,
  sub: `${r.productName} · ${r.sku}`,
  status: r.lot.status,
  qty: qty ?? toDb(r.lot.initialQty),
  href: hrefs.lot(r.lot.id),
  depth,
});

/**
 * Geri izleme: mamul lot → iş emri → tüketilen lotlar → mal kabul → tedarikçi (rekürsif; yarı mamul dahil).
 */
export async function traceBackward(db: DbOrTx, lotId: string): Promise<TraceResult> {
  const g = new Graph();
  const visited = new Set<string>();
  const root = await loadLot(db, lotId);
  if (!root) throw new NotFoundError('Lot', lotId);
  const rootId = g.add(lotNode(root, 0));

  const visit = async (lot: NonNullable<Awaited<ReturnType<typeof loadLot>>>, depth: number) => {
    if (visited.has(lot.lot.id)) return;
    visited.add(lot.lot.id);
    const lotNid = nodeId('lot', lot.lot.id);

    // Üretimden geldiyse: iş emri ve tüketimleri
    if (lot.lot.originWorkOrderId) {
      const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, lot.lot.originWorkOrderId)).limit(1);
      if (wo) {
        const woNid = g.add({ id: wo.id, kind: 'work_order', label: wo.docNo, sub: `Üretilen ${formatQtyTr(wo.producedQty)}`, status: wo.status, qty: toDb(wo.producedQty), href: hrefs.work_order(wo.id), depth: depth + 1 });
        g.link(woNid, lotNid, 'üretim');
        const cons = await db.select().from(workOrderConsumptions).where(eq(workOrderConsumptions.workOrderId, wo.id));
        for (const c of cons) {
          const cl = await loadLot(db, c.lotId);
          if (!cl) continue;
          const cNid = g.add(lotNode(cl, depth + 2));
          g.link(cNid, woNid, 'tüketim', toDb(c.qty));
          await visit(cl, depth + 2);
        }
      }
    }

    // Mal kabulden geldiyse: mal kabul ve tedarikçi
    if (lot.lot.originReceiptId) {
      const [rc] = await db.select().from(receipts).where(eq(receipts.id, lot.lot.originReceiptId)).limit(1);
      if (rc) {
        const rcNid = g.add({ id: rc.id, kind: 'receipt', label: rc.docNo, sub: rc.supplierDeliveryNo ? `İrsaliye ${rc.supplierDeliveryNo}` : null, status: rc.status, href: hrefs.receipt(rc.id), depth: depth + 1 });
        g.link(rcNid, lotNid, 'mal kabul');
        const supplierId = rc.partnerId ?? lot.lot.supplierId;
        if (supplierId) {
          const [p] = await db.select({ id: partners.id, name: partners.name, code: partners.code }).from(partners).where(eq(partners.id, supplierId)).limit(1);
          if (p) {
            const pNid = g.add({ id: p.id, kind: 'partner', label: p.name, sub: `Tedarikçi · ${p.code}`, href: hrefs.partner(p.id), depth: depth + 2 });
            g.link(pNid, rcNid, 'tedarik');
          }
        }
      }
    } else if (lot.lot.supplierId && !lot.lot.originWorkOrderId) {
      const [p] = await db.select({ id: partners.id, name: partners.name, code: partners.code }).from(partners).where(eq(partners.id, lot.lot.supplierId)).limit(1);
      if (p) {
        const pNid = g.add({ id: p.id, kind: 'partner', label: p.name, sub: `Tedarikçi · ${p.code}`, href: hrefs.partner(p.id), depth: depth + 1 });
        g.link(pNid, lotNid, 'tedarik');
      }
    }
  };

  await visit(root, 0);
  return g.result(rootId);
}

/**
 * İleri izleme: lot → iş emirleri (tüketim) → mamul lotlar → sevkiyat satırları → müşteri; ayrıca eldeki stok (quant).
 */
export async function traceForward(db: DbOrTx, lotId: string): Promise<TraceResult> {
  const g = new Graph();
  const visited = new Set<string>();
  const root = await loadLot(db, lotId);
  if (!root) throw new NotFoundError('Lot', lotId);
  const rootId = g.add(lotNode(root, 0));

  const visit = async (lot: NonNullable<Awaited<ReturnType<typeof loadLot>>>, depth: number) => {
    if (visited.has(lot.lot.id)) return;
    visited.add(lot.lot.id);
    const lotNid = nodeId('lot', lot.lot.id);

    // Eldeki stok
    const quants = await db
      .select({ id: stockQuants.id, qty: stockQuants.qty, reserved: stockQuants.reservedQty, locCode: locations.code, usage: locations.usage })
      .from(stockQuants)
      .innerJoin(locations, eq(locations.id, stockQuants.locationId))
      .where(and(eq(stockQuants.lotId, lot.lot.id), gt(stockQuants.qty, '0')));
    for (const q of quants) {
      const qNid = g.add({ id: q.id, kind: 'quant', label: q.locCode, sub: `Eldeki ${formatQtyTr(q.qty)}${D(q.reserved).gt(0) ? ` (rezerve ${formatQtyTr(q.reserved)})` : ''}`, status: q.usage, qty: toDb(q.qty), href: hrefs.quant(lot.lot.id), depth: depth + 1 });
      g.link(lotNid, qNid, 'stok', toDb(q.qty));
    }

    // Tüketildiği iş emirleri → çıktı lotları
    const cons = await db.select().from(workOrderConsumptions).where(eq(workOrderConsumptions.lotId, lot.lot.id));
    const woIds = Array.from(new Set(cons.map((c) => c.workOrderId)));
    if (woIds.length) {
      const wos = await db.select().from(workOrders).where(inArray(workOrders.id, woIds));
      for (const wo of wos) {
        const qty = sum(cons.filter((c) => c.workOrderId === wo.id).map((c) => c.qty));
        const woNid = g.add({ id: wo.id, kind: 'work_order', label: wo.docNo, sub: `Tüketilen ${formatQtyTr(qty)}`, status: wo.status, qty: toDb(qty), href: hrefs.work_order(wo.id), depth: depth + 1 });
        g.link(lotNid, woNid, 'tüketim', toDb(qty));
        const outs = await db.select().from(workOrderOutputs).where(eq(workOrderOutputs.workOrderId, wo.id));
        const outLotIds = new Set(outs.map((o) => o.lotId));
        if (wo.outputLotId) outLotIds.add(wo.outputLotId);
        for (const olId of outLotIds) {
          const ol = await loadLot(db, olId);
          if (!ol) continue;
          const outQty = sum(outs.filter((o) => o.lotId === olId).map((o) => o.qty));
          const oNid = g.add(lotNode(ol, depth + 2, outQty.gt(0) ? toDb(outQty) : undefined));
          g.link(woNid, oNid, 'üretim', outQty.gt(0) ? toDb(outQty) : undefined);
          await visit(ol, depth + 2);
        }
      }
    }

    // Sevkiyatlar → müşteri
    const dls = await db
      .select({ line: deliveryLines, delivery: deliveries })
      .from(deliveryLines)
      .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
      .where(eq(deliveryLines.lotId, lot.lot.id));
    const byDelivery = new Map<string, { delivery: typeof deliveries.$inferSelect; qty: ReturnType<typeof D> }>();
    for (const r of dls) {
      const cur = byDelivery.get(r.delivery.id);
      const q = D(r.line.pickedQty).gt(0) ? D(r.line.pickedQty) : D(r.line.qty);
      if (cur) cur.qty = cur.qty.plus(q); else byDelivery.set(r.delivery.id, { delivery: r.delivery, qty: q });
    }
    for (const { delivery, qty } of byDelivery.values()) {
      const dNid = g.add({ id: delivery.id, kind: 'delivery', label: delivery.docNo, sub: `Sevk ${formatQtyTr(qty)}`, status: delivery.status, qty: toDb(qty), href: hrefs.delivery(delivery.id), depth: depth + 1 });
      g.link(lotNid, dNid, 'sevkiyat', toDb(qty));
      const [p] = await db.select({ id: partners.id, name: partners.name, code: partners.code }).from(partners).where(eq(partners.id, delivery.partnerId)).limit(1);
      if (p) {
        const pNid = g.add({ id: p.id, kind: 'partner', label: p.name, sub: `Müşteri · ${p.code}`, href: hrefs.partner(p.id), depth: depth + 2 });
        g.link(dNid, pNid, 'müşteri', toDb(qty));
      }
    }
  };

  await visit(root, 0);
  return g.result(rootId);
}

export type RecallImpact = {
  lots: Array<{ id: string; lotNo: string; status: string | null; product: string | null; depth: number }>;
  workOrders: Array<{ id: string; docNo: string; status: string | null }>;
  deliveries: Array<{ id: string; docNo: string; status: string | null; qty: string }>;
  customers: Array<{ id: string; name: string }>;
  qtyInStock: string;
  qtyDelivered: string;
  counts: { lots: number; workOrders: number; deliveries: number; customers: number };
};

/** Geri çağırma simülasyonu — `recalls.impact` şekli */
export async function simulateRecall(db: DbOrTx, lotId: string, direction: 'forward' | 'backward' | 'both' = 'both'): Promise<RecallImpact> {
  const results: TraceResult[] = [];
  if (direction === 'forward' || direction === 'both') results.push(await traceForward(db, lotId));
  if (direction === 'backward' || direction === 'both') results.push(await traceBackward(db, lotId));

  const lots = new Map<string, RecallImpact['lots'][number]>();
  const wos = new Map<string, RecallImpact['workOrders'][number]>();
  const dels = new Map<string, RecallImpact['deliveries'][number]>();
  const customers = new Map<string, RecallImpact['customers'][number]>();
  let qtyInStock = ZERO;
  const deliveryEdges = new Map<string, ReturnType<typeof D>>();

  for (const r of results) {
    for (const n of r.nodes) {
      const rawId = n.id.slice(n.kind.length + 1);
      if (n.kind === 'lot') {
        const cur = lots.get(rawId);
        if (!cur || n.depth < cur.depth) lots.set(rawId, { id: rawId, lotNo: n.label, status: n.status ?? null, product: n.sub, depth: n.depth });
      } else if (n.kind === 'work_order') wos.set(rawId, { id: rawId, docNo: n.label, status: n.status ?? null });
      else if (n.kind === 'delivery') dels.set(rawId, { id: rawId, docNo: n.label, status: n.status ?? null, qty: n.qty ?? '0.0000' });
      else if (n.kind === 'partner' && n.sub?.startsWith('Müşteri')) customers.set(rawId, { id: rawId, name: n.label });
    }
    for (const e of r.edges) if (e.label === 'sevkiyat' && e.qty) deliveryEdges.set(e.to, D(e.qty));
  }

  // Eldeki stok: zincirdeki tüm lotların quant toplamı (ileri izleme kökten hesaplanır; geri izlemedeki lotlar için de sayılır)
  const lotIds = Array.from(lots.keys());
  if (lotIds.length) {
    const rows = await db.select({ qty: stockQuants.qty }).from(stockQuants).where(inArray(stockQuants.lotId, lotIds));
    qtyInStock = sum(rows.map((r) => r.qty));
  }
  const qtyDelivered = sum(deliveryEdges.values());

  return {
    lots: Array.from(lots.values()).sort((a, b) => a.depth - b.depth),
    workOrders: Array.from(wos.values()),
    deliveries: Array.from(dels.values()),
    customers: Array.from(customers.values()),
    qtyInStock: toDb(qtyInStock),
    qtyDelivered: toDb(qtyDelivered),
    counts: { lots: lots.size, workOrders: wos.size, deliveries: dels.size, customers: customers.size },
  };
}

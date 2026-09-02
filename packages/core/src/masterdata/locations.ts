import { and, eq, gt, inArray } from 'drizzle-orm';
import { locations, warehouses, stockQuants, stockLots, type DbOrTx } from '@plantero/db';
import { D, ZERO, toDb } from '../money.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';

/**
 * Depo/lokasyon ağacı — Tire (fabrika) + Buca. `code`/`path` her zaman aynı tam yol string'idir
 * (ör. `TIRE/HAM/R01/A`); yeni lokasyon eklerken üst düğümün kodu + kısa bir segment birleştirilir.
 */

export type CreateLocationInput = {
  warehouseId?: string | null;
  parentId?: string | null;
  /** Üst kodun sonuna eklenecek kısa segment, ör. "R04" ya da "A" */
  segment: string;
  name: string;
  usage: string;
  aisle?: string | null;
  rack?: string | null;
  shelf?: string | null;
  barcode?: string | null;
  zone?: string | null;
  isPickable?: boolean;
  sortOrder?: number;
};

function normalizeSegment(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '-');
}

export async function createLocation(tx: DbOrTx, input: CreateLocationInput): Promise<typeof locations.$inferSelect> {
  const segment = normalizeSegment(input.segment);
  if (!segment) throw new ValidationError('Lokasyon kodu (segment) boş olamaz');

  let prefix: string;
  let warehouseId = input.warehouseId ?? null;
  if (input.parentId) {
    const [parent] = await tx.select().from(locations).where(eq(locations.id, input.parentId)).limit(1);
    if (!parent) throw new NotFoundError('Üst lokasyon', input.parentId);
    prefix = parent.code;
    warehouseId = warehouseId ?? parent.warehouseId;
  } else if (warehouseId) {
    const [wh] = await tx.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
    if (!wh) throw new NotFoundError('Depo', warehouseId);
    prefix = wh.code;
  } else {
    prefix = '';
  }
  const code = prefix ? `${prefix}/${segment}` : segment;

  const [existing] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).limit(1);
  if (existing) throw new ValidationError(`Lokasyon kodu zaten var: ${code}`);

  const [row] = await tx
    .insert(locations)
    .values({
      warehouseId,
      parentId: input.parentId ?? null,
      code,
      name: input.name,
      path: code,
      usage: input.usage as (typeof locations.$inferInsert)['usage'],
      aisle: input.aisle ?? null,
      rack: input.rack ?? null,
      shelf: input.shelf ?? null,
      barcode: input.barcode ?? null,
      zone: input.zone ?? null,
      isPickable: input.isPickable ?? true,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row!;
}

export type UpdateLocationInput = Partial<{
  name: string;
  usage: string;
  aisle: string | null;
  rack: string | null;
  shelf: string | null;
  barcode: string | null;
  zone: string | null;
  isPickable: boolean;
  isActive: boolean;
  sortOrder: number;
}>;

export async function updateLocation(tx: DbOrTx, id: string, input: UpdateLocationInput): Promise<typeof locations.$inferSelect> {
  const [existing] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Lokasyon', id);
  const set: Partial<typeof locations.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.usage !== undefined) set.usage = input.usage as (typeof locations.$inferInsert)['usage'];
  if (input.aisle !== undefined) set.aisle = input.aisle;
  if (input.rack !== undefined) set.rack = input.rack;
  if (input.shelf !== undefined) set.shelf = input.shelf;
  if (input.barcode !== undefined) set.barcode = input.barcode;
  if (input.zone !== undefined) set.zone = input.zone;
  if (input.isPickable !== undefined) set.isPickable = input.isPickable;
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder;
  const [row] = await tx.update(locations).set(set).where(eq(locations.id, id)).returning();
  return row!;
}

/** Bir lokasyonun tüm alt düğümlerinin id'leri (kendisi hariç), bellek içi listeden. */
export function getDescendantIds(all: Array<{ id: string; parentId: string | null }>, rootId: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const l of all) {
    if (!l.parentId) continue;
    const list = byParent.get(l.parentId) ?? [];
    list.push(l.id);
    byParent.set(l.parentId, list);
  }
  const out: string[] = [];
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}

export type LocationTreeNode = {
  id: string;
  code: string;
  name: string;
  usage: string;
  parentId: string | null;
  isPickable: boolean;
  isActive: boolean;
  barcode: string | null;
  /** Bu düğüm + tüm alt düğümlerin toplamı */
  ownQty: string;
  ownValue: string;
  totalQty: string;
  totalValue: string;
  children: LocationTreeNode[];
};

/**
 * Depo lokasyon ağacı, her düğümde eldeki miktar/değer özetiyle (alt düğümler dahil toplanır).
 * `usage in ('internal','quarantine','rejected','transit')` dışındaki lokasyonlar (sanal: production/supplier/customer/scrap/inventory_loss)
 * quant tutmaz — ledger kuralına uygun olarak özet her zaman 0 gelir.
 */
export async function getLocationTree(tx: DbOrTx, warehouseId: string): Promise<LocationTreeNode[]> {
  const rows = await tx.select().from(locations).where(eq(locations.warehouseId, warehouseId));
  const locationIds = rows.map((l) => l.id);
  const quantRows = locationIds.length
    ? await tx
        .select({ locationId: stockQuants.locationId, qty: stockQuants.qty, unitCost: stockLots.unitCost })
        .from(stockQuants)
        .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
        .where(and(inArray(stockQuants.locationId, locationIds), gt(stockQuants.qty, '0')))
    : [];

  const valueByLocation = new Map<string, { qty: import('decimal.js').default; value: import('decimal.js').default }>();
  for (const q of quantRows) {
    const cur = valueByLocation.get(q.locationId) ?? { qty: ZERO, value: ZERO };
    const qty = D(q.qty);
    const unitCost = q.unitCost ? D(q.unitCost) : ZERO;
    valueByLocation.set(q.locationId, { qty: cur.qty.plus(qty), value: cur.value.plus(qty.mul(unitCost)) });
  }

  const nodeById = new Map<string, LocationTreeNode>();
  for (const l of rows) {
    const own = valueByLocation.get(l.id) ?? { qty: ZERO, value: ZERO };
    nodeById.set(l.id, {
      id: l.id,
      code: l.code,
      name: l.name,
      usage: l.usage,
      parentId: l.parentId,
      isPickable: l.isPickable,
      isActive: l.isActive,
      barcode: l.barcode,
      ownQty: toDb(own.qty),
      ownValue: toDb(own.value),
      totalQty: toDb(own.qty),
      totalValue: toDb(own.value),
      children: [],
    });
  }

  const roots: LocationTreeNode[] = [];
  for (const l of rows) {
    const node = nodeById.get(l.id)!;
    if (l.parentId && nodeById.has(l.parentId)) nodeById.get(l.parentId)!.children.push(node);
    else roots.push(node);
  }

  // Alt toplamları yukarı taşı (post-order)
  function rollup(node: LocationTreeNode): { qty: import('decimal.js').default; value: import('decimal.js').default } {
    let qty = D(node.ownQty);
    let value = D(node.ownValue);
    for (const child of node.children) {
      const r = rollup(child);
      qty = qty.plus(r.qty);
      value = value.plus(r.value);
    }
    node.totalQty = toDb(qty);
    node.totalValue = toDb(value);
    return { qty, value };
  }
  for (const r of roots) rollup(r);

  const sortRec = (nodes: LocationTreeNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code, 'tr-TR'));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);

  return roots;
}

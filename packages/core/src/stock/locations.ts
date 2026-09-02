import { and, eq, isNull, or, like } from 'drizzle-orm';
import { locations, warehouses, type DbOrTx } from '@plantero/db';
import { NotFoundError, DomainError } from '../auth/errors.js';
import type { ProductType, LocationUsage } from '../types.js';

/**
 * Lokasyon yardımcıları — receipts/deliveries/transfers/counts ortak kullanır.
 * Depo kod ağacı `packages/db/src/seed/masterdata.ts`teki LOCATIONS ile birebir (TIRE/BUCA).
 */

export type LocationRow = typeof locations.$inferSelect;

export async function getWarehouse(tx: DbOrTx, warehouseId: string): Promise<typeof warehouses.$inferSelect> {
  const [w] = await tx.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!w) throw new NotFoundError('Depo', warehouseId);
  return w;
}

async function firstByUsage(tx: DbOrTx, warehouseId: string | null, usage: LocationUsage): Promise<LocationRow | null> {
  const conds = [eq(locations.usage, usage), eq(locations.isActive, true)];
  conds.push(warehouseId ? eq(locations.warehouseId, warehouseId) : isNull(locations.warehouseId));
  const [row] = await tx.select().from(locations).where(and(...conds)).orderBy(locations.sortOrder, locations.code).limit(1);
  return row ?? null;
}

/** Belirli kullanım türünde herhangi bir aktif lokasyon (depo ayrımı yapılmaz) */
async function anyByUsage(tx: DbOrTx, usage: LocationUsage): Promise<LocationRow | null> {
  const [row] = await tx.select().from(locations).where(and(eq(locations.usage, usage), eq(locations.isActive, true))).orderBy(locations.sortOrder, locations.code).limit(1);
  return row ?? null;
}

/** Sanal tedarikçi lokasyonu (gerçek seed'de tek, depo bağımsız kayıt: SUPPLIERS) */
export async function getSuppliersLocation(tx: DbOrTx): Promise<LocationRow> {
  const row = await anyByUsage(tx, 'supplier');
  if (!row) throw new DomainError('LOCATION_MISSING', 'Sanal tedarikçi lokasyonu (SUPPLIERS) bulunamadı — masterdata seed çalıştırılmalı');
  return row;
}

/** Sanal müşteri lokasyonu (gerçek seed'de tek, depo bağımsız kayıt: CUSTOMERS) */
export async function getCustomersLocation(tx: DbOrTx): Promise<LocationRow> {
  const row = await anyByUsage(tx, 'customer');
  if (!row) throw new DomainError('LOCATION_MISSING', 'Sanal müşteri lokasyonu (CUSTOMERS) bulunamadı — masterdata seed çalıştırılmalı');
  return row;
}

/** Depodaki karantina lokasyonu */
export async function getQuarantineLocation(tx: DbOrTx, warehouseId: string): Promise<LocationRow> {
  const row = await firstByUsage(tx, warehouseId, 'quarantine');
  if (!row) throw new DomainError('LOCATION_MISSING', 'Bu depoda karantina lokasyonu tanımlı değil', { warehouseId });
  return row;
}

/** Depodaki red lokasyonu */
export async function getRejectedLocation(tx: DbOrTx, warehouseId: string): Promise<LocationRow> {
  const row = await firstByUsage(tx, warehouseId, 'rejected');
  if (!row) throw new DomainError('LOCATION_MISSING', 'Bu depoda red lokasyonu tanımlı değil', { warehouseId });
  return row;
}

/** Depodaki sevkiyat/transit lokasyonu (depolar arası transfer ara durağı) */
export async function getTransitLocation(tx: DbOrTx, warehouseId: string): Promise<LocationRow> {
  const row = await firstByUsage(tx, warehouseId, 'transit');
  if (!row) throw new DomainError('LOCATION_MISSING', 'Bu depoda transit lokasyonu tanımlı değil', { warehouseId });
  return row;
}

/** Depodaki hurda (scrap) lokasyonu */
export async function getScrapLocation(tx: DbOrTx, warehouseId: string): Promise<LocationRow> {
  const row = await firstByUsage(tx, warehouseId, 'scrap');
  if (!row) throw new DomainError('LOCATION_MISSING', 'Bu depoda hurda lokasyonu tanımlı değil', { warehouseId });
  return row;
}

/** Depodaki sayım farkı (inventory_loss) lokasyonu */
export async function getInventoryLossLocation(tx: DbOrTx, warehouseId: string): Promise<LocationRow> {
  const row = await firstByUsage(tx, warehouseId, 'inventory_loss');
  if (!row) throw new DomainError('LOCATION_MISSING', 'Bu depoda sayım farkı lokasyonu tanımlı değil', { warehouseId });
  return row;
}

/**
 * Ürün tipine göre depodaki varsayılan fiziksel (internal) yerleşim kökü — mal kabul serbest bırakma
 * ve satış FEFO toplama kökü için kullanılır. Hammadde/ambalaj → HAM/AMB alt ağacı, mamul/yarı mamul/
 * ticari mal → MAMUL alt ağacı. Eşleşme yoksa depodaki ilk pickable internal lokasyona düşer.
 */
export async function resolveWarehouseRoot(tx: DbOrTx, warehouseId: string, productType: ProductType): Promise<LocationRow> {
  const wh = await getWarehouse(tx, warehouseId);
  const candidates = productType === 'raw_material' || productType === 'packaging' ? [`${wh.code}/HAM`, `${wh.code}/AMB`] : [`${wh.code}/MAMUL`];
  for (const code of candidates) {
    const [row] = await tx.select().from(locations).where(eq(locations.code, code)).limit(1);
    if (row) return row;
  }
  const [fallback] = await tx
    .select()
    .from(locations)
    .where(and(eq(locations.warehouseId, warehouseId), eq(locations.usage, 'internal'), eq(locations.isPickable, true), eq(locations.isActive, true)))
    .orderBy(locations.code)
    .limit(1);
  if (!fallback) throw new DomainError('LOCATION_MISSING', 'Bu depoda uygun bir fiziksel lokasyon bulunamadı', { warehouseId, productType });
  return fallback;
}

/** Aynı depoda ürün tipine göre somut bir toplama/rafa koyma lokasyonu (mal kabul serbest bırakma varsayılanı) */
export async function resolveDefaultPutawayLocation(tx: DbOrTx, warehouseId: string, productType: ProductType): Promise<LocationRow> {
  const root = await resolveWarehouseRoot(tx, warehouseId, productType);
  if (root.isPickable) return root;
  const [child] = await tx
    .select()
    .from(locations)
    .where(and(eq(locations.parentId, root.id), eq(locations.isPickable, true), eq(locations.isActive, true)))
    .orderBy(locations.sortOrder, locations.code)
    .limit(1);
  return child ?? root;
}

/** Bir lokasyonun alt ağacındaki (kendisi dahil) tüm lokasyon id'lerini bulmak için path koşulu */
export function subtreeCondition(root: Pick<LocationRow, 'path'>) {
  return or(eq(locations.path, root.path), like(locations.path, `${root.path}/%`))!;
}

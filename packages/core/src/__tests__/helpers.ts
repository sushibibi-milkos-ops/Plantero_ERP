import { randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import Decimal from 'decimal.js';
import {
  db, type Tx, uoms, warehouses, locations, partners, products, journals, fiscalPeriods,
} from '@plantero/db';
import { ensureCoreAccounts } from '../accounting/mapping.js';
import type { ActorCtx } from '../types.js';

export const ctx: ActorCtx = { userId: null, userEmail: 'test@plantero.local', requestId: 'test' };

class Rollback extends Error {
  constructor() { super('rollback'); this.name = 'Rollback'; }
}

/** Testi bir transaction içinde çalıştırır ve sonunda geri alır — DB'de iz bırakmaz */
export async function withRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/** Hata beklenen çağrıyı savepoint içinde çalıştırır; ana transaction bozulmaz. Hata nesnesini döner. */
export async function expectReject(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<unknown> {
  let caught: unknown = null;
  try {
    await tx.transaction(async (sp) => {
      await fn(sp);
    });
  } catch (e) {
    caught = e;
  }
  if (!caught) throw new Error('Hata bekleniyordu, çağrı başarılı oldu');
  return caught;
}

export const suffix = () => randomBytes(3).toString('hex').toUpperCase();
export const today = () => new Date().toISOString().slice(0, 10);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const daysFromNow = (n: number) => isoDate(new Date(Date.now() + n * 86_400_000));

export type Base = Awaited<ReturnType<typeof seedBase>>;

/** Testlerin ihtiyaç duyduğu ana veriyi üretir (seed'e bağımlı değil) */
export async function seedBase(tx: Tx) {
  const s = suffix();
  await ensureCoreAccounts(tx);

  for (const j of [
    { code: 'GEN', name: 'Genel Yevmiye', kind: 'general' as const },
    { code: 'STK', name: 'Stok Yevmiyesi', kind: 'stock' as const },
    { code: 'URT', name: 'Üretim Yevmiyesi', kind: 'production' as const },
  ]) {
    await tx.insert(journals).values(j).onConflictDoNothing({ target: journals.code });
  }

  // Bu ayın mali dönemi
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  await tx.insert(fiscalPeriods).values({ code: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m, startDate: start, endDate }).onConflictDoNothing({ target: fiscalPeriods.code });

  // Birim
  await tx.insert(uoms).values({ code: 'KG', name: 'Kilogram', category: 'weight' }).onConflictDoNothing({ target: uoms.code });
  const [kg] = await tx.select().from(uoms).where(eq(uoms.code, 'KG')).limit(1);

  // Depo + lokasyon ağacı
  const [wh] = await tx.insert(warehouses).values({ code: `T${s}`, name: `Test Depo ${s}`, isProduction: true }).returning();
  const whId = wh!.id;
  const mkLoc = async (code: string, usage: (typeof locations.$inferInsert)['usage'], opts: { parentId?: string; isPickable?: boolean } = {}) => {
    const [row] = await tx.insert(locations).values({ warehouseId: whId, code, name: code, path: code, usage, parentId: opts.parentId ?? null, isPickable: opts.isPickable ?? true }).returning();
    return row!;
  };
  const root = await mkLoc(`T${s}`, 'view');
  const ham = await mkLoc(`T${s}/HAM`, 'internal', { parentId: root.id });
  const hamR01 = await mkLoc(`T${s}/HAM/R01`, 'internal', { parentId: ham.id });
  const hamR02 = await mkLoc(`T${s}/HAM/R02`, 'internal', { parentId: ham.id });
  const mamul = await mkLoc(`T${s}/MAMUL`, 'internal', { parentId: root.id });
  const kar = await mkLoc(`T${s}/KARANTINA`, 'quarantine', { parentId: root.id });
  const red = await mkLoc(`T${s}/RED`, 'rejected', { parentId: root.id });
  const sup = await mkLoc(`T${s}/V/TEDARIKCI`, 'supplier');
  const cust = await mkLoc(`T${s}/V/MUSTERI`, 'customer');
  const prod = await mkLoc(`T${s}/V/URETIM`, 'production');
  const scrap = await mkLoc(`T${s}/V/FIRE`, 'scrap');
  const loss = await mkLoc(`T${s}/V/SAYIM`, 'inventory_loss');

  // Cariler
  const [supplier] = await tx.insert(partners).values({ code: `S-${s}`, name: `Tedarikçi ${s}`, kind: 'supplier' }).returning();
  const [customer] = await tx.insert(partners).values({ code: `C-${s}`, name: `Müşteri ${s}`, kind: 'customer' }).returning();

  // Ürünler
  const [raw] = await tx.insert(products).values({
    sku: `1${s}01`, name: `Badem Ham ${s}`, type: 'raw_material', uomId: kg!.id, isLotTracked: true, isPurchasable: true,
    costMethod: 'lot', requiresIncomingQc: true, shelfLifeDays: 365, vatRate: '1', purchaseVatRate: '20',
  }).returning();
  const [finished] = await tx.insert(products).values({
    sku: `2${s}01`, name: `Badem Bazı ${s}`, type: 'finished', uomId: kg!.id, isLotTracked: true, isSellable: true, isManufactured: true,
    costMethod: 'lot', requiresIncomingQc: false, shelfLifeDays: 180,
  }).returning();
  const [pack] = await tx.insert(products).values({
    sku: `3${s}01`, name: `Koli ${s}`, type: 'packaging', uomId: kg!.id, isLotTracked: false, isPurchasable: true, costMethod: 'average',
  }).returning();

  return {
    s, kg: kg!, wh: wh!,
    loc: { root, ham, hamR01, hamR02, mamul, kar, red, sup, cust, prod, scrap, loss },
    supplier: supplier!, customer: customer!,
    raw: raw!, finished: finished!, pack: pack!,
  };
}

export const d = (v: string | number) => new Decimal(v);
export { and, eq };

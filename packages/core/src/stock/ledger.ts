import { and, eq, isNull, or, like, sql, asc, gt, inArray } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { products, locations, stockLots, stockQuants, stockMoves, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, ZERO, sum } from '../money.js';
import { nextDocNo } from '../sequences.js';
import { writeAudit } from '../audit/index.js';
import { DomainError, NotFoundError, ValidationError } from '../auth/errors.js';
import { postJournalEntry, type JournalLineInput } from '../accounting/journal.js';
import { inventoryAccountFor, cogsAccountFor, moveAccountLines, journalCodeForMove, UNVALUED_MOVE_KINDS } from '../accounting/mapping.js';
import type { ActorCtx, DocumentOrigin, StockMoveKind, LocationUsage, LotStatus } from '../types.js';

/* ------------------------------------------------------------------ */
/* Tipler                                                              */
/* ------------------------------------------------------------------ */

export type StockMoveInput = {
  kind: StockMoveKind;
  productId: string;
  lotId?: string | null;
  fromLocationId: string;
  toLocationId: string;
  qty: Decimal;
  uomId: string;
  /** Verilmezse lot.unitCost (lotlu) / product.averageCost (lotsuz) */
  unitCost?: Decimal;
  /** production hareketinde genel gider payı (731'e alacak); geri kalan 151'den düşer */
  overheadValue?: Decimal;
  refType: string;
  refId: string;
  refLineId?: string | null;
  refNo?: string | null;
  partnerId?: string | null;
  movedAt?: Date;
  origin?: DocumentOrigin;
  note?: string | null;
  isValued?: boolean;
  /** Çıkışta önceden yapılmış rezervasyonu tüketir (available yerine qty kontrolü) */
  useReserved?: boolean;
};

export type PostStockMoveResult = { moveId: string; moveNo: string; value: Decimal; unitCost: Decimal; journalEntryIds: string[] };

export type FefoPick = { lotId: string | null; lotNo: string | null; locationId: string; qty: Decimal; unitCost: Decimal; expiryDate: string | null };

/** Quant tutulan (fiziksel) lokasyon kullanımları */
export const STOCKED_USAGES: readonly LocationUsage[] = ['internal', 'quarantine', 'rejected', 'transit'];
/** Sanal lokasyonlar — quant tutulmaz */
export const VIRTUAL_USAGES: readonly LocationUsage[] = ['production', 'customer', 'supplier', 'scrap', 'inventory_loss'];

const isStocked = (u: LocationUsage) => STOCKED_USAGES.includes(u);

/** Lot maliyetini belirleyen (orijin) hareket türleri */
const LOT_ORIGIN_KINDS: readonly StockMoveKind[] = ['receipt', 'production', 'byproduct', 'opening'];
/** Sanal kaynaktan gelen giriş hareketleri (ortalama maliyet güncellenir) */
const INBOUND_KINDS: readonly StockMoveKind[] = ['receipt', 'production', 'byproduct', 'opening', 'count_gain', 'return_in', 'recall_return'];
/** Red/geri çağrılmış/süresi dolmuş lotun yapabileceği hareketler */
const BAD_LOT_ALLOWED: readonly StockMoveKind[] = ['scrap', 'return_out', 'recall_return', 'count_loss'];
const BAD_LOT_STATUSES: readonly LotStatus[] = ['rejected', 'recalled', 'expired'];

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const quantWhere = (productId: string, locationId: string, lotId: string | null) =>
  and(eq(stockQuants.productId, productId), eq(stockQuants.locationId, locationId), lotId ? eq(stockQuants.lotId, lotId) : isNull(stockQuants.lotId));

async function lockQuant(tx: DbOrTx, productId: string, locationId: string, lotId: string | null) {
  const [q] = await tx.select().from(stockQuants).where(quantWhere(productId, locationId, lotId)).for('update');
  return q ?? null;
}

async function totalOnHand(tx: DbOrTx, productId: string, lotId?: string | null): Promise<Decimal> {
  const conds = [eq(stockQuants.productId, productId)];
  if (lotId) conds.push(eq(stockQuants.lotId, lotId));
  const [row] = await tx.select({ qty: sql<string>`coalesce(sum(${stockQuants.qty}), 0)` }).from(stockQuants).where(and(...conds));
  return D(row?.qty);
}

/* ------------------------------------------------------------------ */
/* postStockMove — TEK stok yazma noktası                               */
/* ------------------------------------------------------------------ */

export async function postStockMove(tx: DbOrTx, input: StockMoveInput, ctx: ActorCtx): Promise<PostStockMoveResult> {
  const qty = round4(D(input.qty));
  if (qty.lte(0)) throw new ValidationError('Miktar sıfırdan büyük olmalı', { qty: toDb(qty) });
  if (input.fromLocationId === input.toLocationId) throw new ValidationError('Kaynak ve hedef lokasyon aynı olamaz');

  const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', input.productId);
  const [from] = await tx.select().from(locations).where(eq(locations.id, input.fromLocationId)).limit(1);
  if (!from) throw new NotFoundError('Kaynak lokasyon', input.fromLocationId);
  const [to] = await tx.select().from(locations).where(eq(locations.id, input.toLocationId)).limit(1);
  if (!to) throw new NotFoundError('Hedef lokasyon', input.toLocationId);
  if (from.usage === 'view' || to.usage === 'view') throw new ValidationError('Görünüm lokasyonuna hareket yapılamaz');
  if (!from.isActive || !to.isActive) throw new ValidationError('Pasif lokasyona hareket yapılamaz');

  // Lot kuralları
  let lot: typeof stockLots.$inferSelect | null = null;
  if (product.isLotTracked) {
    if (!input.lotId) throw new DomainError('LOT_REQUIRED', `${product.name} lot takipli; lotsuz hareket yapılamaz`, { productId: product.id });
  }
  if (input.lotId) {
    const [l] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId)).for('update');
    if (!l) throw new NotFoundError('Lot', input.lotId);
    if (l.productId !== product.id) throw new ValidationError('Lot bu ürüne ait değil', { lotId: l.id, productId: product.id });
    lot = l;
    enforceLotRules(lot, input.kind, from.usage, to.usage);
  }

  // Maliyet
  const movedAt = input.movedAt ?? new Date();
  const { unitCost, lotCostUpdated, newAverage } = await resolveCost(tx, { product, lot, kind: input.kind, qty, inputCost: input.unitCost, fromUsage: from.usage, toUsage: to.usage });
  const value = round4(qty.mul(unitCost));

  // Quant: kaynak
  if (isStocked(from.usage)) {
    const q = await lockQuant(tx, product.id, from.id, lot?.id ?? null);
    const onHand = D(q?.qty);
    const reserved = D(q?.reservedQty);
    const available = input.useReserved ? onHand : onHand.minus(reserved);
    if (available.lt(qty)) {
      throw new DomainError('INSUFFICIENT_STOCK', `Yetersiz stok: ${product.name}${lot ? ` / ${lot.lotNo}` : ''} @ ${from.code} — mevcut ${toDb(available)}, istenen ${toDb(qty)}`, {
        productId: product.id, lotId: lot?.id ?? null, locationId: from.id, available: toDb(available), requested: toDb(qty),
      });
    }
    const newReserved = input.useReserved ? Decimal.max(ZERO, reserved.minus(qty)) : reserved;
    await tx.update(stockQuants).set({ qty: toDb(onHand.minus(qty)), reservedQty: toDb(newReserved), updatedAt: new Date() }).where(eq(stockQuants.id, q!.id));
  }

  // Quant: hedef
  if (isStocked(to.usage)) {
    const q = await lockQuant(tx, product.id, to.id, lot?.id ?? null);
    if (q) {
      await tx.update(stockQuants).set({ qty: toDb(D(q.qty).plus(qty)), expiryDate: lot?.expiryDate ?? q.expiryDate, updatedAt: new Date() }).where(eq(stockQuants.id, q.id));
    } else {
      await tx.insert(stockQuants).values({
        productId: product.id, locationId: to.id, lotId: lot?.id ?? null,
        qty: toDb(qty), reservedQty: toDb(ZERO), inDate: movedAt, expiryDate: lot?.expiryDate ?? null,
      });
    }
  }

  // Değerleme kararı
  const isValued = input.isValued ?? (!UNVALUED_MOVE_KINDS.includes(input.kind) && !value.isZero());

  // Hareket kaydı
  const moveNo = await nextDocNo(tx, 'SM', movedAt);
  const [move] = await tx
    .insert(stockMoves)
    .values({
      moveNo,
      kind: input.kind,
      productId: product.id,
      lotId: lot?.id ?? null,
      fromLocationId: from.id,
      toLocationId: to.id,
      qty: toDb(qty),
      uomId: input.uomId,
      unitCost: toDb(unitCost),
      value: toDb(value),
      refType: input.refType,
      refId: input.refId,
      refLineId: input.refLineId ?? null,
      refNo: input.refNo ?? null,
      partnerId: input.partnerId ?? null,
      isValued,
      origin: input.origin ?? 'chain',
      movedAt,
      note: input.note ?? null,
      createdBy: ctx.userId ?? null,
    })
    .returning({ id: stockMoves.id });
  const moveId = move!.id;

  // Lot güncellemeleri
  if (lot) {
    const patch: Partial<typeof stockLots.$inferInsert> = {};
    if (lotCostUpdated) patch.unitCost = toDb(unitCost);
    if (LOT_ORIGIN_KINDS.includes(input.kind)) {
      patch.initialQty = toDb(D(lot.initialQty).plus(qty));
      if (input.kind === 'receipt' && !lot.originReceiptId && input.refType === 'receipt') {
        patch.originReceiptId = input.refId;
        if (input.refLineId) patch.originReceiptLineId = input.refLineId;
      }
      if ((input.kind === 'production' || input.kind === 'byproduct') && !lot.originWorkOrderId && input.refType === 'work_order') {
        patch.originWorkOrderId = input.refId;
      }
      if (input.partnerId && !lot.supplierId && input.kind === 'receipt') patch.supplierId = input.partnerId;
    }
    if (input.kind === 'quarantine_release') {
      patch.status = 'released';
      patch.releasedAt = movedAt;
      patch.releasedBy = ctx.userId ?? null;
    } else if (input.kind === 'quarantine_reject') {
      patch.status = 'rejected';
      if (input.note) patch.rejectReason = input.note;
    } else if (input.kind === 'consumption') {
      const remaining = await totalOnHand(tx, product.id, lot.id);
      if (remaining.lte(0)) patch.status = 'consumed';
    }
    if (Object.keys(patch).length) await tx.update(stockLots).set({ ...patch, updatedBy: ctx.userId ?? null }).where(eq(stockLots.id, lot.id));
  }
  if (newAverage) {
    await tx.update(products).set({ averageCost: toDb(newAverage), updatedBy: ctx.userId ?? null }).where(eq(products.id, product.id));
  }

  // Muhasebe fişi — iki deftere
  const journalEntryIds: string[] = [];
  if (isValued) {
    const inventoryCode = inventoryAccountFor(product);
    const mapping = moveAccountLines(input.kind, inventoryCode, cogsAccountFor(product));
    if (!mapping) throw new DomainError('MOVE_NOT_MAPPED', `${input.kind} hareketi için hesap eşlemesi yok`);
    const overhead = input.kind === 'production' ? round4(D(input.overheadValue)) : ZERO;
    if (overhead.gt(value)) throw new ValidationError('Genel gider payı hareket değerinden büyük olamaz', { overhead: toDb(overhead), value: toDb(value) });
    const lines: JournalLineInput[] = [];
    for (const m of mapping) {
      const amount = m.share === 'total' ? value : m.share === 'overhead' ? overhead : value.minus(overhead);
      if (amount.isZero()) continue;
      lines.push({
        accountCode: m.accountCode,
        debit: m.side === 'debit' ? amount : undefined,
        credit: m.side === 'credit' ? amount : undefined,
        productId: product.id,
        warehouseId: (isStocked(to.usage) ? to.warehouseId : from.warehouseId) ?? null,
        description: `${moveNo} ${product.name}${lot ? ` [${lot.lotNo}]` : ''}`,
      });
    }
    const res = await postJournalEntry(tx, {
      ledger: 'both',
      journalCode: journalCodeForMove(input.kind),
      entryDate: movedAt,
      description: `Stok hareketi ${moveNo} (${input.kind}): ${product.name}${lot ? ` [${lot.lotNo}]` : ''} ${toDb(qty)}`,
      refType: 'stock_move',
      refId: moveId,
      refNo: moveNo,
      partnerId: input.partnerId ?? null,
      lines,
      origin: input.origin ?? 'chain',
    }, ctx);
    if (res.vukId) journalEntryIds.push(res.vukId);
    if (res.ufrsId) journalEntryIds.push(res.ufrsId);
    await tx.update(stockMoves).set({ journalEntryId: res.vukId ?? null }).where(eq(stockMoves.id, moveId));
  }

  await writeAudit(tx, {
    action: 'post',
    tableName: 'stock_moves',
    recordId: moveId,
    summary: `Stok hareketi ${moveNo} (${input.kind}): ${product.name}${lot ? ` [${lot.lotNo}]` : ''} ${toDb(qty)} ${from.code} → ${to.code}`,
    after: { kind: input.kind, productId: product.id, lotId: lot?.id ?? null, qty: toDb(qty), unitCost: toDb(unitCost), value: toDb(value), refType: input.refType, refId: input.refId, journalEntryIds },
  }, ctx);

  return { moveId, moveNo, value, unitCost, journalEntryIds };
}

/** Lot durumu × hareket türü × lokasyon kuralları (I16) */
function enforceLotRules(lot: typeof stockLots.$inferSelect, kind: StockMoveKind, fromUsage: LocationUsage, toUsage: LocationUsage): void {
  const label = `Lot ${lot.lotNo} (${lot.status})`;
  // Müşteriye / üretime yalnızca serbest lot
  if ((toUsage === 'customer' || toUsage === 'production') && lot.status !== 'released') {
    throw new DomainError('LOT_NOT_RELEASED', `${label} ${toUsage === 'customer' ? 'sevk edilemez' : 'üretime giremez'}; yalnızca serbest (released) lot`, { lotId: lot.id, status: lot.status, kind });
  }
  if (BAD_LOT_STATUSES.includes(lot.status) && !BAD_LOT_ALLOWED.includes(kind)) {
    throw new DomainError('LOT_BLOCKED', `${label} hiçbir yere çıkamaz (fire/iade hariç)`, { lotId: lot.id, status: lot.status, kind });
  }
  if (lot.status === 'quarantine') {
    const allowedKinds: StockMoveKind[] = ['receipt', 'production', 'byproduct', 'opening', 'count_gain', 'count_loss', 'quarantine_release', 'quarantine_reject', 'scrap', 'return_out', 'transfer', 'return_in', 'recall_return'];
    const okTarget = toUsage === 'quarantine' || toUsage === 'rejected' || toUsage === 'scrap' || toUsage === 'supplier' || toUsage === 'inventory_loss'
      || (kind === 'quarantine_release' && (toUsage === 'internal' || toUsage === 'transit'));
    if (!allowedKinds.includes(kind) || !okTarget) {
      throw new DomainError('LOT_IN_QUARANTINE', `${label} yalnızca karantina → serbest/red hareketi yapabilir`, { lotId: lot.id, kind, toUsage });
    }
  }
  if (kind === 'quarantine_release' && lot.status !== 'quarantine') throw new DomainError('LOT_NOT_IN_QUARANTINE', `${label} karantinada değil`);
  if (kind === 'quarantine_reject' && lot.status !== 'quarantine') throw new DomainError('LOT_NOT_IN_QUARANTINE', `${label} karantinada değil`);
  if (kind === 'consumption' && fromUsage === 'production') throw new ValidationError('Tüketim üretim lokasyonundan yapılamaz');
}

/** Maliyet çözümü: lotlu → lot; lotsuz → hareketli ağırlıklı ortalama */
async function resolveCost(
  tx: DbOrTx,
  o: { product: typeof products.$inferSelect; lot: typeof stockLots.$inferSelect | null; kind: StockMoveKind; qty: Decimal; inputCost?: Decimal; fromUsage: LocationUsage; toUsage: LocationUsage },
): Promise<{ unitCost: Decimal; lotCostUpdated: boolean; newAverage: Decimal | null }> {
  const inputCost = o.inputCost !== undefined ? round4(D(o.inputCost)) : null;
  if (inputCost && inputCost.lt(0)) throw new ValidationError('Birim maliyet negatif olamaz');

  if (o.lot) {
    if (LOT_ORIGIN_KINDS.includes(o.kind) && inputCost !== null) {
      // receipt/production/opening lot maliyetini belirler
      return { unitCost: inputCost, lotCostUpdated: !D(o.lot.unitCost).eq(inputCost), newAverage: null };
    }
    const lotCost = D(o.lot.unitCost);
    if (LOT_ORIGIN_KINDS.includes(o.kind) && lotCost.isZero() && !isStocked(o.fromUsage)) {
      // Orijin hareketinde maliyet verilmedi ve lot maliyetsiz → 0 ile devam (açılışta izinli)
      return { unitCost: ZERO, lotCostUpdated: false, newAverage: null };
    }
    return { unitCost: inputCost ?? lotCost, lotCostUpdated: false, newAverage: null };
  }

  // Lotsuz ürün
  const avg = D(o.product.averageCost);
  const inbound = INBOUND_KINDS.includes(o.kind) && !isStocked(o.fromUsage) && isStocked(o.toUsage);
  if (inbound) {
    const unitCost = inputCost ?? avg;
    const onHand = await totalOnHand(tx, o.product.id);
    const base = Decimal.max(ZERO, onHand);
    const newAverage = base.plus(o.qty).isZero() ? unitCost : round4(base.mul(avg).plus(o.qty.mul(unitCost)).div(base.plus(o.qty)));
    return { unitCost, lotCostUpdated: false, newAverage };
  }
  if (o.product.costMethod === 'standard') return { unitCost: inputCost ?? D(o.product.standardCost), lotCostUpdated: false, newAverage: null };
  return { unitCost: inputCost ?? avg, lotCostUpdated: false, newAverage: null };
}

/* ------------------------------------------------------------------ */
/* createLot                                                           */
/* ------------------------------------------------------------------ */

export type CreateLotInput = {
  productId: string;
  lotNo: string;
  origin: (typeof stockLots.$inferInsert)['origin'];
  uomId?: string;
  unitCost?: Decimal;
  productionDate?: Date | string | null;
  expiryDate?: Date | string | null;
  supplierId?: string | null;
  supplierLotNo?: string | null;
  originReceiptId?: string | null;
  originReceiptLineId?: string | null;
  originWorkOrderId?: string | null;
  status?: LotStatus;
  qcStatus?: string | null;
  note?: string | null;
  meta?: Record<string, unknown>;
};

const toDateStr = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
const addDays = (d: string, days: number): string => {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

/** SKT'den FEFO uyarı/kaldırma tarihleri: uyarı = SKT − %25 raf ömrü (≤90 gün), kaldırma = SKT − %5 raf ömrü (≤14 gün) */
export function fefoDates(expiryDate: string | null, shelfLifeDays: number | null): { alertDate: string | null; removalDate: string | null } {
  if (!expiryDate) return { alertDate: null, removalDate: null };
  const life = shelfLifeDays && shelfLifeDays > 0 ? shelfLifeDays : 365;
  const alertOffset = Math.min(90, Math.max(7, Math.ceil(life * 0.25)));
  const removalOffset = Math.min(14, Math.max(1, Math.ceil(life * 0.05)));
  return { alertDate: addDays(expiryDate, -alertOffset), removalDate: addDays(expiryDate, -removalOffset) };
}

/**
 * Lot oluşturur. SKT verilmezse üretim tarihi + ürün raf ömründen; alert/removal tarihleri SKT'den türetilir.
 * Durum: verilmezse ürün `requiresIncomingQc` ise karantina, değilse serbest.
 */
export async function createLot(tx: DbOrTx, input: CreateLotInput, ctx: ActorCtx = { userId: null }): Promise<typeof stockLots.$inferSelect> {
  const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', input.productId);
  if (!input.lotNo?.trim()) throw new ValidationError('Lot numarası zorunlu');

  const productionDate = input.productionDate ? toDateStr(input.productionDate) : null;
  let expiryDate = input.expiryDate ? toDateStr(input.expiryDate) : null;
  if (!expiryDate && product.shelfLifeDays && product.shelfLifeDays > 0) {
    expiryDate = addDays(productionDate ?? toDateStr(new Date()), product.shelfLifeDays);
  }
  const { alertDate, removalDate } = fefoDates(expiryDate, product.shelfLifeDays);
  const status: LotStatus = input.status ?? (product.requiresIncomingQc ? 'quarantine' : 'released');

  const [lot] = await tx
    .insert(stockLots)
    .values({
      lotNo: input.lotNo.trim(),
      productId: product.id,
      status,
      origin: input.origin,
      supplierLotNo: input.supplierLotNo ?? null,
      supplierId: input.supplierId ?? null,
      originReceiptId: input.originReceiptId ?? null,
      originReceiptLineId: input.originReceiptLineId ?? null,
      originWorkOrderId: input.originWorkOrderId ?? null,
      productionDate,
      expiryDate,
      alertDate,
      removalDate,
      unitCost: toDb(input.unitCost ?? 0),
      initialQty: toDb(0),
      uomId: input.uomId ?? product.uomId,
      qcStatus: input.qcStatus ?? (status === 'quarantine' ? 'pending' : null),
      releasedAt: status === 'released' ? new Date() : null,
      releasedBy: status === 'released' ? ctx.userId ?? null : null,
      note: input.note ?? null,
      meta: input.meta ?? {},
      createdBy: ctx.userId ?? null,
    })
    .returning();
  return lot!;
}

/* ------------------------------------------------------------------ */
/* FEFO                                                                */
/* ------------------------------------------------------------------ */

/**
 * FEFO seçimi: kök lokasyon alt ağacındaki (path) toplanabilir, internal lokasyonlardan;
 * lot durumu allowStatuses içinde; en erken SKT önce (NULLS LAST), sonra giriş tarihi.
 * available = qty − reserved. Yetersizse hata (allowPartial ile kısmi liste döner).
 */
export async function pickFefo(
  tx: DbOrTx,
  opts: { productId: string; qty: Decimal; rootLocationId: string; allowStatuses?: LotStatus[]; allowPartial?: boolean; excludeLotIds?: string[] },
): Promise<FefoPick[]> {
  const need = round4(D(opts.qty));
  if (need.lte(0)) throw new ValidationError('Miktar sıfırdan büyük olmalı');
  const allow = opts.allowStatuses ?? ['released'];
  const [root] = await tx.select({ id: locations.id, path: locations.path }).from(locations).where(eq(locations.id, opts.rootLocationId)).limit(1);
  if (!root) throw new NotFoundError('Lokasyon', opts.rootLocationId);
  const [product] = await tx.select({ isLotTracked: products.isLotTracked, averageCost: products.averageCost }).from(products).where(eq(products.id, opts.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', opts.productId);

  const available = sql<string>`(${stockQuants.qty} - ${stockQuants.reservedQty})`;
  const conds = [
    eq(stockQuants.productId, opts.productId),
    or(eq(locations.path, root.path), like(locations.path, `${root.path}/%`)),
    eq(locations.isPickable, true),
    eq(locations.isActive, true),
    eq(locations.usage, 'internal'),
    gt(available, sql`0`),
  ];
  if (product.isLotTracked) conds.push(inArray(stockLots.status, allow));
  else conds.push(isNull(stockQuants.lotId));
  if (opts.excludeLotIds?.length) conds.push(sql`${stockQuants.lotId} is null or ${stockQuants.lotId} not in ${opts.excludeLotIds}`);

  const rows = await tx
    .select({
      lotId: stockQuants.lotId,
      lotNo: stockLots.lotNo,
      locationId: stockQuants.locationId,
      available,
      unitCost: stockLots.unitCost,
      expiryDate: stockLots.expiryDate,
      inDate: stockQuants.inDate,
    })
    .from(stockQuants)
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(...conds))
    .orderBy(sql`${stockLots.expiryDate} asc nulls last`, asc(stockQuants.inDate), asc(stockLots.lotNo));

  const picks: FefoPick[] = [];
  let remaining = need;
  for (const r of rows) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, D(r.available));
    picks.push({
      lotId: r.lotId ?? null,
      lotNo: r.lotNo ?? null,
      locationId: r.locationId,
      qty: take,
      unitCost: r.lotId ? D(r.unitCost) : D(product.averageCost),
      expiryDate: r.expiryDate ?? null,
    });
    remaining = remaining.minus(take);
  }
  if (remaining.gt(0) && !opts.allowPartial) {
    throw new DomainError('INSUFFICIENT_STOCK', `FEFO: yeterli serbest stok yok — eksik ${toDb(remaining)}`, { productId: opts.productId, requested: toDb(need), shortage: toDb(remaining) });
  }
  return picks;
}

/* ------------------------------------------------------------------ */
/* Rezervasyon                                                         */
/* ------------------------------------------------------------------ */

export async function reserve(tx: DbOrTx, o: { productId: string; lotId?: string | null; locationId: string; qty: Decimal }): Promise<void> {
  const qty = round4(D(o.qty));
  if (qty.lte(0)) throw new ValidationError('Rezervasyon miktarı sıfırdan büyük olmalı');
  const q = await lockQuant(tx, o.productId, o.locationId, o.lotId ?? null);
  const available = D(q?.qty).minus(D(q?.reservedQty));
  if (!q || available.lt(qty)) {
    throw new DomainError('INSUFFICIENT_STOCK', `Rezervasyon için yeterli stok yok: mevcut ${toDb(available)}, istenen ${toDb(qty)}`, { ...o, qty: toDb(qty), available: toDb(available) });
  }
  await tx.update(stockQuants).set({ reservedQty: toDb(D(q.reservedQty).plus(qty)), updatedAt: new Date() }).where(eq(stockQuants.id, q.id));
}

export async function release(tx: DbOrTx, o: { productId: string; lotId?: string | null; locationId: string; qty: Decimal }): Promise<void> {
  const qty = round4(D(o.qty));
  if (qty.lte(0)) return;
  const q = await lockQuant(tx, o.productId, o.locationId, o.lotId ?? null);
  if (!q) return;
  await tx.update(stockQuants).set({ reservedQty: toDb(Decimal.max(ZERO, D(q.reservedQty).minus(qty))), updatedAt: new Date() }).where(eq(stockQuants.id, q.id));
}

/* ------------------------------------------------------------------ */
/* Eldeki stok                                                         */
/* ------------------------------------------------------------------ */

export async function getOnHand(
  tx: DbOrTx,
  o: { productId: string; warehouseId?: string | null; locationId?: string | null; lotId?: string | null; includeQuarantine?: boolean },
): Promise<{ qty: Decimal; reserved: Decimal; available: Decimal; value: Decimal }> {
  const conds = [eq(stockQuants.productId, o.productId)];
  if (o.lotId) conds.push(eq(stockQuants.lotId, o.lotId));
  if (o.warehouseId) conds.push(eq(locations.warehouseId, o.warehouseId));
  if (o.locationId) {
    const [root] = await tx.select({ path: locations.path }).from(locations).where(eq(locations.id, o.locationId)).limit(1);
    if (!root) throw new NotFoundError('Lokasyon', o.locationId);
    conds.push(or(eq(locations.path, root.path), like(locations.path, `${root.path}/%`))!);
  }
  if (o.includeQuarantine === false) conds.push(eq(locations.usage, 'internal'));

  const rows = await tx
    .select({
      qty: stockQuants.qty,
      reserved: stockQuants.reservedQty,
      lotCost: stockLots.unitCost,
      avgCost: products.averageCost,
    })
    .from(stockQuants)
    .innerJoin(locations, eq(locations.id, stockQuants.locationId))
    .innerJoin(products, eq(products.id, stockQuants.productId))
    .leftJoin(stockLots, eq(stockLots.id, stockQuants.lotId))
    .where(and(...conds));

  const qty = sum(rows.map((r) => r.qty));
  const reserved = sum(rows.map((r) => r.reserved));
  const value = round4(sum(rows.map((r) => D(r.qty).mul(D(r.lotCost ?? r.avgCost)))));
  return { qty, reserved, available: qty.minus(reserved), value };
}

import { and, eq, isNull, or, like, sql, asc, gt, inArray, notInArray } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { products, locations, stockLots, stockQuants, stockMoves, type DbOrTx } from '@plantero/db';
import { D, toDb, round4, ZERO, sum, formatQtyTr } from '../money.js';
import { businessDate, addDays } from '../dates.js';
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
  /**
   * Giriş hareketlerinde (receipt/production/byproduct/opening/count_gain/return_in/recall_return) maliyet.
   * Lotlu üründe yalnızca lot maliyetini belirleyen orijin hareketlerinde (receipt/production/byproduct/opening)
   * dikkate alınır; diğer hareketler lot maliyetiyle değerlenir. Lotsuz üründe çıkışlar hareketli ortalama ile değerlenir.
   */
  unitCost?: Decimal;
  /** production hareketinde genel gider payı (731'e alacak); geri kalan 151.01 WIP'ten düşer. stock_moves.overheadValue'ya yazılır */
  overheadValue?: Decimal;
  refType: string;
  refId: string;
  refLineId?: string | null;
  refNo?: string | null;
  partnerId?: string | null;
  movedAt?: Date;
  origin?: DocumentOrigin;
  note?: string | null;
  /**
   * Yalnızca bilgi amaçlı geriye dönük uyumluluk: değerleme kararını ledger verir
   * (değerli tür + sıfırdan farklı tutar → fiş atılır). Değerli bir hareket çağıran tarafından değersiz yapılamaz.
   */
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

/**
 * Yevmiye fiş açıklamasında hareket türü — Türkçe UI kuralı (CLAUDE.md) İngilizce enum'un çıplak
 * basılmasını yasaklar. Kök neden (tur 2 P1 muhasebe-yevmiye-03): açıklama üretici `input.kind`
 * enum değerini ("delivery", "receipt"…) doğrudan parantez içine basıyordu — /muhasebe/yevmiye'de
 * 50 satırın 50'sinde Türkçe cümle ortasında çıplak İngilizce enum görünüyordu.
 */
const STOCK_MOVE_KIND_LABELS: Record<StockMoveKind, string> = {
  receipt: 'mal kabul',
  delivery: 'sevkiyat',
  transfer: 'transfer',
  consumption: 'sarf',
  production: 'üretim çıktısı',
  byproduct: 'yan ürün çıktısı',
  scrap: 'fire',
  count_gain: 'sayım fazlası',
  count_loss: 'sayım eksiği',
  quarantine_release: 'karantina serbest',
  quarantine_reject: 'karantina red',
  return_in: 'iade girişi',
  return_out: 'iade çıkışı',
  opening: 'açılış',
  recall_return: 'geri çağırma iadesi',
};

/** Lot maliyetini belirleyen (orijin) hareket türleri */
const LOT_ORIGIN_KINDS: readonly StockMoveKind[] = ['receipt', 'production', 'byproduct', 'opening'];
/** Red/geri çağrılmış/süresi dolmuş lotun yapabileceği hareketler */
const BAD_LOT_ALLOWED: readonly StockMoveKind[] = ['scrap', 'return_out', 'recall_return', 'count_loss'];
const BAD_LOT_STATUSES: readonly LotStatus[] = ['rejected', 'recalled', 'expired'];

/**
 * Hareket türü → yön ve sanal uç kuralı (ARCHITECTURE §6.1-3).
 * `in`: sanal → fiziksel (quant artar), `out`: fiziksel → sanal (quant düşer), `internal`: fiziksel → fiziksel,
 * `wip`: üretim (sanal) → fire (sanal) — iş emri WIP firesi; quant değişmez, 659 / 151.01 (I15).
 * `virtualUsage` verilmişse sanal ucun kullanımı tam olarak bu olmalı (ör. delivery yalnızca müşteriye).
 * Bu tablo I1'in ön koşuludur: değerli her hareket quant'ı tam olarak fiş tutarı kadar değiştirir.
 */
type MoveDirection = 'in' | 'out' | 'internal' | 'wip';
const MOVE_RULES: Record<StockMoveKind, { direction: MoveDirection; virtualUsage?: LocationUsage[] }> = {
  receipt: { direction: 'in', virtualUsage: ['supplier'] },
  production: { direction: 'in', virtualUsage: ['production'] },
  byproduct: { direction: 'in', virtualUsage: ['production'] },
  opening: { direction: 'in' },
  count_gain: { direction: 'in', virtualUsage: ['inventory_loss'] },
  return_in: { direction: 'in', virtualUsage: ['customer'] },
  recall_return: { direction: 'in', virtualUsage: ['customer'] },
  return_out: { direction: 'out', virtualUsage: ['supplier'] },
  consumption: { direction: 'out', virtualUsage: ['production'] },
  scrap: { direction: 'out', virtualUsage: ['scrap'] },
  delivery: { direction: 'out', virtualUsage: ['customer'] },
  count_loss: { direction: 'out', virtualUsage: ['inventory_loss'] },
  transfer: { direction: 'internal' },
  quarantine_release: { direction: 'internal' },
  quarantine_reject: { direction: 'internal' },
};

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const quantWhere = (productId: string, locationId: string, lotId: string | null) =>
  and(eq(stockQuants.productId, productId), eq(stockQuants.locationId, locationId), lotId ? eq(stockQuants.lotId, lotId) : isNull(stockQuants.lotId));

async function lockQuant(tx: DbOrTx, productId: string, locationId: string, lotId: string | null) {
  const [q] = await tx.select().from(stockQuants).where(quantWhere(productId, locationId, lotId)).for('update');
  return q ?? null;
}

/**
 * Maliyet taşıyıcısının (lotlu → lot; lotsuz → ürünün lotsuz quant'ları) toplam fiziksel miktarı.
 * Lotsuz üründe lotlu quant'lar hariç tutulur; aksi halde ortalama maliyet ve I1 değeri yanlış hesaplanır.
 */
async function totalOnHand(tx: DbOrTx, productId: string, lotId: string | null): Promise<Decimal> {
  const conds = [eq(stockQuants.productId, productId), lotId ? eq(stockQuants.lotId, lotId) : isNull(stockQuants.lotId)];
  const [row] = await tx.select({ qty: sql<string>`coalesce(sum(${stockQuants.qty}), 0)` }).from(stockQuants).where(and(...conds));
  return D(row?.qty);
}

/** Hareket türü ↔ lokasyon kullanımı tutarlılığı (ledger uygular, çağıran güvenmez) */
function enforceDirection(kind: StockMoveKind, from: { code: string; usage: LocationUsage }, to: { code: string; usage: LocationUsage }): MoveDirection {
  const rule = MOVE_RULES[kind];
  if (!rule) throw new DomainError('MOVE_KIND_UNKNOWN', `Bilinmeyen hareket türü: ${kind}`);
  const fromStocked = isStocked(from.usage);
  const toStocked = isStocked(to.usage);
  const fail = (msg: string) => new DomainError('MOVE_DIRECTION_INVALID', `${kind}: ${msg} (${from.code}[${from.usage}] → ${to.code}[${to.usage}])`, { kind, fromUsage: from.usage, toUsage: to.usage });
  if (rule.direction === 'internal') {
    if (!fromStocked || !toStocked) throw fail('yalnızca fiziksel lokasyonlar arasında yapılabilir');
    return 'internal';
  }
  // İş emri WIP firesi: zaten tüketilmiş (151.01'e alınmış) malzemenin üretim lokasyonundan fireye çıkışı
  if (kind === 'scrap' && from.usage === 'production') {
    if (to.usage !== 'scrap') throw fail('üretim lokasyonundan fire yalnızca fire (scrap) lokasyonuna yapılabilir');
    return 'wip';
  }
  if (rule.direction === 'in') {
    if (fromStocked || !toStocked) throw fail('sanal kaynaktan fiziksel hedefe yapılmalı');
    if (rule.virtualUsage && !rule.virtualUsage.includes(from.usage)) throw fail(`kaynak lokasyon kullanımı ${rule.virtualUsage.join('/')} olmalı`);
    return 'in';
  }
  if (!fromStocked || toStocked) throw fail('fiziksel kaynaktan sanal hedefe yapılmalı');
  if (rule.virtualUsage && !rule.virtualUsage.includes(to.usage)) throw fail(`hedef lokasyon kullanımı ${rule.virtualUsage.join('/')} olmalı`);
  return 'out';
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
  const direction = enforceDirection(input.kind, from, to);
  if (direction === 'wip' && input.refType !== 'work_order') {
    throw new DomainError('WIP_SCRAP_REQUIRES_WORK_ORDER', 'Üretim lokasyonundan fire yalnızca iş emri kaynaklı olabilir (refType=work_order)', { refType: input.refType });
  }
  const movedAt = input.movedAt ?? new Date();

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
    enforceLotRules(lot, input.kind, from.usage, to.usage, movedAt);
  }

  // Quant'ları kilitle, taşıyıcının hareket öncesi toplamını al (maliyet ve yuvarlama hesabı bunun üstüne kurulur)
  const lotKey = lot?.id ?? null;
  const fromQ = isStocked(from.usage) ? await lockQuant(tx, product.id, from.id, lotKey) : null;
  if (isStocked(to.usage)) await lockQuant(tx, product.id, to.id, lotKey);
  const onHandBefore = await totalOnHand(tx, product.id, lotKey);

  // Maliyet
  const cost = resolveCost({ product, lot, kind: input.kind, qty, inputCost: input.unitCost, direction, onHandBefore });
  const { unitCost, costBefore, costAfter } = cost;
  const value = round4(qty.mul(unitCost));

  // Quant: kaynak
  if (isStocked(from.usage)) {
    const onHand = D(fromQ?.qty);
    const reserved = D(fromQ?.reservedQty);
    const available = input.useReserved ? onHand : onHand.minus(reserved);
    if (!fromQ || available.lt(qty)) {
      throw new DomainError('INSUFFICIENT_STOCK', `Yetersiz stok: ${product.name}${lot ? ` / ${lot.lotNo}` : ''} @ ${from.code} — mevcut ${toDb(available)}, istenen ${toDb(qty)}`, {
        productId: product.id, lotId: lot?.id ?? null, locationId: from.id, available: toDb(available), requested: toDb(qty),
      });
    }
    const newReserved = input.useReserved ? Decimal.max(ZERO, reserved.minus(qty)) : reserved;
    await tx.update(stockQuants).set({ qty: toDb(onHand.minus(qty)), reservedQty: toDb(newReserved), updatedAt: new Date() }).where(eq(stockQuants.id, fromQ.id));
  }

  // Quant: hedef — gerçek upsert (stock_quants_uq NULLS NOT DISTINCT: lotsuz quant da tek satır)
  if (isStocked(to.usage)) {
    const now = new Date();
    await tx
      .insert(stockQuants)
      .values({
        productId: product.id, locationId: to.id, lotId: lotKey,
        qty: toDb(qty), reservedQty: toDb(ZERO), inDate: movedAt, expiryDate: lot?.expiryDate ?? null, updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [stockQuants.productId, stockQuants.locationId, stockQuants.lotId],
        set: {
          qty: sql`${stockQuants.qty} + ${toDb(qty)}::numeric`,
          expiryDate: lot?.expiryDate ? lot.expiryDate : sql`${stockQuants.expiryDate}`,
          updatedAt: now,
        },
      });
  }

  // Değerleme kararı — ledger verir; değerli tür + sıfırdan farklı tutar → fiş
  const isValued = !UNVALUED_MOVE_KINDS.includes(input.kind) && !value.isZero();

  // Genel gider payı yalnızca production hareketinde; value = malzeme payı (151.01) + overhead (731)
  const overhead = input.kind === 'production' && input.overheadValue !== undefined ? round4(D(input.overheadValue)) : null;
  if (overhead) {
    if (overhead.lt(0)) throw new ValidationError('Genel gider payı negatif olamaz', { overhead: toDb(overhead) });
    if (overhead.gt(value)) throw new ValidationError('Genel gider payı hareket değerinden büyük olamaz', { overhead: toDb(overhead), value: toDb(value) });
  }

  // Hareket kaydı
  const moveNo = await nextDocNo(tx, 'SM', movedAt);
  const [move] = await tx
    .insert(stockMoves)
    .values({
      moveNo,
      kind: input.kind,
      productId: product.id,
      lotId: lotKey,
      fromLocationId: from.id,
      toLocationId: to.id,
      qty: toDb(qty),
      uomId: input.uomId,
      unitCost: toDb(unitCost),
      value: toDb(value),
      overheadValue: overhead ? toDb(overhead) : null,
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
    if (!costAfter.eq(D(lot.unitCost))) patch.unitCost = toDb(costAfter);
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
  } else if (!costAfter.eq(D(product.averageCost))) {
    await tx.update(products).set({ averageCost: toDb(costAfter), updatedBy: ctx.userId ?? null }).where(eq(products.id, product.id));
  }

  // Muhasebe fişi — iki deftere
  const journalEntryIds: string[] = [];
  if (isValued) {
    const inventoryCode = inventoryAccountFor(product);
    const mapping = moveAccountLines(input.kind, inventoryCode, cogsAccountFor(product), { wipScrap: direction === 'wip' });
    if (!mapping) throw new DomainError('MOVE_NOT_MAPPED', `${input.kind} hareketi için hesap eşlemesi yok`);
    const overheadShare = overhead ?? ZERO;
    const warehouseId = (isStocked(to.usage) ? to.warehouseId : from.warehouseId) ?? null;
    const label = `${moveNo} ${product.name}${lot ? ` [${lot.lotNo}]` : ''}`;
    const lines: JournalLineInput[] = [];
    for (const m of mapping) {
      const amount = m.share === 'total' ? value : m.share === 'overhead' ? overheadShare : value.minus(overheadShare);
      if (amount.isZero()) continue;
      lines.push({
        accountCode: m.accountCode,
        debit: m.side === 'debit' ? amount : undefined,
        credit: m.side === 'credit' ? amount : undefined,
        productId: product.id,
        warehouseId,
        description: label,
      });
    }
    // Yuvarlama düzeltmesi: taşıyıcı değeri (Σquant × maliyet, 4 hane) ile fiş tutarı arasındaki
    // 4 hane yuvarlama farkı 659/679'a atılır; böylece 15X bakiyesi = envanter değeri (I1) tam tutar.
    // WIP firesinde (direction 'wip') quant ve taşıyıcı maliyeti değişmez → fark sıfır.
    const onHandAfter = direction === 'in' ? onHandBefore.plus(qty) : direction === 'out' ? onHandBefore.minus(qty) : onHandBefore;
    const signedValue = direction === 'in' ? value : direction === 'out' ? value.neg() : ZERO;
    const rounding = round4(onHandAfter.mul(costAfter)).minus(round4(onHandBefore.mul(costBefore))).minus(signedValue);
    if (!rounding.isZero()) {
      const abs = rounding.abs();
      lines.push({ accountCode: inventoryCode, debit: rounding.gt(0) ? abs : undefined, credit: rounding.lt(0) ? abs : undefined, productId: product.id, warehouseId, description: `${label} — yuvarlama` });
      lines.push({ accountCode: rounding.gt(0) ? '679' : '659', debit: rounding.lt(0) ? abs : undefined, credit: rounding.gt(0) ? abs : undefined, productId: product.id, warehouseId, description: `${label} — yuvarlama` });
    }
    const res = await postJournalEntry(tx, {
      ledger: 'both',
      journalCode: journalCodeForMove(input.kind),
      entryDate: movedAt,
      description: `Stok hareketi ${moveNo} (${STOCK_MOVE_KIND_LABELS[input.kind]}): ${product.name}${lot ? ` [${lot.lotNo}]` : ''} ${formatQtyTr(qty)}`,
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
    summary: `Stok hareketi ${moveNo} (${STOCK_MOVE_KIND_LABELS[input.kind]}): ${product.name}${lot ? ` [${lot.lotNo}]` : ''} ${formatQtyTr(qty)} ${from.code} → ${to.code}`,
    after: { kind: input.kind, productId: product.id, lotId: lotKey, qty: toDb(qty), unitCost: toDb(unitCost), value: toDb(value), overheadValue: overhead ? toDb(overhead) : null, refType: input.refType, refId: input.refId, journalEntryIds },
  }, ctx);

  return { moveId, moveNo, value, unitCost, journalEntryIds };
}

/** Lot durumu × hareket türü × lokasyon kuralları (I16) */
function enforceLotRules(lot: typeof stockLots.$inferSelect, kind: StockMoveKind, fromUsage: LocationUsage, toUsage: LocationUsage, movedAt: Date): void {
  const label = `Lot ${lot.lotNo} (${lot.status})`;
  // Müşteriye / üretime yalnızca serbest lot
  if ((toUsage === 'customer' || toUsage === 'production') && lot.status !== 'released') {
    throw new DomainError('LOT_NOT_RELEASED', `${label} ${toUsage === 'customer' ? 'sevk edilemez' : 'üretime giremez'}; yalnızca serbest (released) lot`, { lotId: lot.id, status: lot.status, kind });
  }
  // SKT geçmiş lot (durumu henüz 'expired' yapılmamış olsa da) müşteriye / üretime gidemez
  if ((toUsage === 'customer' || toUsage === 'production') && lot.expiryDate && lot.expiryDate < businessDate(movedAt)) {
    throw new DomainError('LOT_EXPIRED', `${label} son kullanma tarihi geçmiş (${lot.expiryDate}); ${toUsage === 'customer' ? 'sevk edilemez' : 'üretime giremez'}`, { lotId: lot.id, expiryDate: lot.expiryDate, kind });
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

/**
 * Maliyet çözümü.
 * - Lotlu: orijin hareketi (receipt/production/byproduct/opening) + verilen maliyet → lot maliyetini belirler;
 *   lotta halihazırda stok varsa ağırlıklı ortalama ile birleşir. Diğer hareketler lot maliyetiyle değerlenir
 *   (çağıranın verdiği maliyet yok sayılır — I1: quant değeri = 15X bakiyesi).
 * - Lotsuz: giriş → hareketli ağırlıklı ortalama güncellenir; çıkış → ortalama maliyet; WIP firesi → verilen maliyet (yoksa ortalama).
 * Döner: hareketin birim maliyeti, taşıyıcının hareket öncesi/sonrası maliyeti.
 */
function resolveCost(o: {
  product: typeof products.$inferSelect; lot: typeof stockLots.$inferSelect | null; kind: StockMoveKind; qty: Decimal;
  inputCost?: Decimal; direction: MoveDirection; onHandBefore: Decimal;
}): { unitCost: Decimal; costBefore: Decimal; costAfter: Decimal } {
  const inputCost = o.inputCost !== undefined ? round4(D(o.inputCost)) : null;
  if (inputCost && inputCost.lt(0)) throw new ValidationError('Birim maliyet negatif olamaz');
  const base = Decimal.max(ZERO, o.onHandBefore);
  const weighted = (oldCost: Decimal, newCost: Decimal): Decimal => {
    const total = base.plus(o.qty);
    return total.isZero() ? newCost : round4(base.mul(oldCost).plus(o.qty.mul(newCost)).div(total));
  };

  if (o.lot) {
    const lotCost = D(o.lot.unitCost);
    if (LOT_ORIGIN_KINDS.includes(o.kind) && inputCost !== null) {
      const costAfter = base.isZero() ? inputCost : weighted(lotCost, inputCost);
      return { unitCost: inputCost, costBefore: lotCost, costAfter };
    }
    return { unitCost: lotCost, costBefore: lotCost, costAfter: lotCost };
  }

  // Lotsuz ürün
  const avg = D(o.product.averageCost);
  if (o.direction === 'in') {
    const unitCost = inputCost ?? (o.product.costMethod === 'standard' ? D(o.product.standardCost) : avg);
    return { unitCost, costBefore: avg, costAfter: weighted(avg, unitCost) };
  }
  // WIP firesi: taşıyıcı (quant) yok; çağıranın verdiği maliyet (iş emrindeki tüketim maliyeti), yoksa ortalama
  if (o.direction === 'wip') return { unitCost: inputCost ?? avg, costBefore: avg, costAfter: avg };
  return { unitCost: avg, costBefore: avg, costAfter: avg };
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

export type FefoPolicy = { shelfLifeDays?: number | null; alertDaysBeforeExpiry?: number | null; removalDaysBeforeExpiry?: number | null };

/**
 * SKT'den FEFO uyarı/kaldırma tarihleri.
 * Ürün kartındaki gün ofsetleri (`alertDaysBeforeExpiry` / `removalDaysBeforeExpiry`) öncelikli;
 * boşsa yüzde kuralı: uyarı = SKT − %25 raf ömrü (7..90 gün), kaldırma = SKT − %5 raf ömrü (1..14 gün).
 */
export function fefoDates(expiryDate: string | null, policy: FefoPolicy | number | null): { alertDate: string | null; removalDate: string | null } {
  if (!expiryDate) return { alertDate: null, removalDate: null };
  const p: FefoPolicy = typeof policy === 'number' || policy === null ? { shelfLifeDays: policy } : policy;
  const life = p.shelfLifeDays && p.shelfLifeDays > 0 ? p.shelfLifeDays : 365;
  const explicit = (v: number | null | undefined) => (v !== null && v !== undefined && v >= 0 ? v : null);
  const alertOffset = explicit(p.alertDaysBeforeExpiry) ?? Math.min(90, Math.max(7, Math.ceil(life * 0.25)));
  const removalOffset = explicit(p.removalDaysBeforeExpiry) ?? Math.min(14, Math.max(1, Math.ceil(life * 0.05)));
  return { alertDate: addDays(expiryDate, -alertOffset), removalDate: addDays(expiryDate, -removalOffset) };
}

/**
 * Lot oluşturur. SKT verilmezse üretim tarihi + ürün raf ömründen; alert/removal tarihleri ürün kartındaki
 * gün ofsetlerinden (yoksa yüzde kuralıyla) SKT'den türetilir.
 * Durum: verilmezse ürün `requiresIncomingQc` ise karantina, değilse serbest.
 */
export async function createLot(tx: DbOrTx, input: CreateLotInput, ctx: ActorCtx = { userId: null }): Promise<typeof stockLots.$inferSelect> {
  const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', input.productId);
  if (!input.lotNo?.trim()) throw new ValidationError('Lot numarası zorunlu');

  const productionDate = input.productionDate ? businessDate(input.productionDate) : null;
  let expiryDate = input.expiryDate ? businessDate(input.expiryDate) : null;
  if (!expiryDate && product.shelfLifeDays && product.shelfLifeDays > 0) {
    expiryDate = addDays(productionDate ?? businessDate(new Date()), product.shelfLifeDays);
  }
  const { alertDate, removalDate } = fefoDates(expiryDate, product);
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
 * lot durumu allowStatuses içinde; SKT'si geçmiş lotlar hariç; en erken SKT önce (NULLS LAST), sonra giriş tarihi.
 * available = qty − reserved. Yetersizse hata (allowPartial ile kısmi liste döner).
 */
export async function pickFefo(
  tx: DbOrTx,
  opts: { productId: string; qty: Decimal; rootLocationId: string; allowStatuses?: LotStatus[]; allowPartial?: boolean; excludeLotIds?: string[]; asOf?: Date },
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
  if (product.isLotTracked) {
    conds.push(inArray(stockLots.status, allow));
    conds.push(or(isNull(stockLots.expiryDate), sql`${stockLots.expiryDate} >= ${businessDate(opts.asOf ?? new Date())}`)!);
  } else {
    conds.push(isNull(stockQuants.lotId));
  }
  if (opts.excludeLotIds?.length) conds.push(or(isNull(stockQuants.lotId), notInArray(stockQuants.lotId, opts.excludeLotIds))!);

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

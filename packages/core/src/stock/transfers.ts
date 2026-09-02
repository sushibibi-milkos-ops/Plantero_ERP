import { eq } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { transfers, transferLines, type DbOrTx } from '@plantero/db';
import { D, toDb, round4 } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { postStockMove } from './ledger.js';
import { getTransitLocation } from './locations.js';
import type { ActorCtx } from '../types.js';

/**
 * Transfer — lokasyonlar arası (aynı depo) veya depolar arası (Tire↔Buca, transit ara durağı ile).
 * Stok yazımı yalnızca `stock/ledger.postStockMove(kind:'transfer')` (değersiz hareket).
 */

export type TransferLineInput = { productId: string; lotId?: string | null; qty: Decimal; uomId: string; fromLocationId: string; toLocationId: string };

export type CreateTransferInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  scheduledDate?: string | Date | null;
  reason?: string | null;
  note?: string | null;
  lines: TransferLineInput[];
};

export type TransferWithLines = { transfer: typeof transfers.$inferSelect; lines: Array<typeof transferLines.$inferSelect> };

export async function createTransfer(tx: DbOrTx, input: CreateTransferInput, ctx: ActorCtx): Promise<TransferWithLines> {
  if (!input.lines.length) throw new ValidationError('En az bir satır gerekli');
  const docNo = await nextDocNo(tx, 'TR');
  const [transfer] = await tx
    .insert(transfers)
    .values({
      docNo, status: 'draft', fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId,
      fromLocationId: input.lines[0]!.fromLocationId, toLocationId: input.lines[0]!.toLocationId,
      scheduledDate: input.scheduledDate ? businessDate(input.scheduledDate) : null, reason: input.reason ?? null,
      origin: 'manual', note: input.note ?? null, createdBy: ctx.userId ?? null,
    })
    .returning();

  const lines: Array<typeof transferLines.$inferSelect> = [];
  let seq = 10;
  for (const l of input.lines) {
    const qty = round4(D(l.qty));
    if (qty.lte(0)) throw new ValidationError('Satır miktarı sıfırdan büyük olmalı');
    const [row] = await tx
      .insert(transferLines)
      .values({ transferId: transfer!.id, productId: l.productId, lotId: l.lotId ?? null, qty: toDb(qty), uomId: l.uomId, fromLocationId: l.fromLocationId, toLocationId: l.toLocationId, sequence: seq })
      .returning();
    lines.push(row!);
    seq += 10;
  }

  await indexDocument(tx, { type: 'transfer', recordId: transfer!.id, docNo, status: 'draft', origin: 'manual', title: `Transfer ${docNo}`, docDate: new Date() });
  return { transfer: transfer!, lines };
}

/**
 * Transferi tamamlar/başlatır: aynı depo içi transferde tek hareketle hedefe ('done'); depolar arası
 * transferde önce kaynak deponun transit lokasyonuna ('in_transit') — ikinci ayak `receiveTransfer` ile.
 */
export async function completeTransfer(tx: DbOrTx, transferId: string, ctx: ActorCtx): Promise<TransferWithLines> {
  const [transfer] = await tx.select().from(transfers).where(eq(transfers.id, transferId)).for('update');
  if (!transfer) throw new NotFoundError('Transfer', transferId);
  if (transfer.status !== 'draft') throw new DomainError('TRANSFER_ALREADY_PROCESSED', `Transfer ${transfer.docNo} zaten işlenmiş`, { status: transfer.status });
  const lines = await tx.select().from(transferLines).where(eq(transferLines.transferId, transferId));

  const crossWarehouse = transfer.fromWarehouseId !== transfer.toWarehouseId;
  const movedAt = new Date();

  if (crossWarehouse) {
    const transit = await getTransitLocation(tx, transfer.fromWarehouseId);
    for (const line of lines) {
      await postStockMove(tx, {
        kind: 'transfer', productId: line.productId, lotId: line.lotId, fromLocationId: line.fromLocationId, toLocationId: transit.id,
        qty: D(line.qty), uomId: line.uomId, refType: 'transfer', refId: transferId, refLineId: line.id, refNo: transfer.docNo, origin: transfer.origin, movedAt,
      }, ctx);
    }
    const [updated] = await tx.update(transfers).set({ status: 'in_transit', updatedBy: ctx.userId ?? null }).where(eq(transfers.id, transferId)).returning();
    await indexDocument(tx, { type: 'transfer', recordId: transferId, docNo: transfer.docNo, status: 'in_transit', origin: transfer.origin, title: `Transfer ${transfer.docNo}` });
    return { transfer: updated!, lines };
  }

  for (const line of lines) {
    await postStockMove(tx, {
      kind: 'transfer', productId: line.productId, lotId: line.lotId, fromLocationId: line.fromLocationId, toLocationId: line.toLocationId,
      qty: D(line.qty), uomId: line.uomId, refType: 'transfer', refId: transferId, refLineId: line.id, refNo: transfer.docNo, origin: transfer.origin, movedAt,
    }, ctx);
  }
  const [updated] = await tx.update(transfers).set({ status: 'done', doneAt: movedAt, updatedBy: ctx.userId ?? null }).where(eq(transfers.id, transferId)).returning();
  await indexDocument(tx, { type: 'transfer', recordId: transferId, docNo: transfer.docNo, status: 'done', origin: transfer.origin, title: `Transfer ${transfer.docNo}` });
  return { transfer: updated!, lines };
}

/** Depolar arası transferin ikinci ayağı: transit → hedef lokasyon ('teslim al'). */
export async function receiveTransfer(tx: DbOrTx, transferId: string, ctx: ActorCtx): Promise<TransferWithLines> {
  const [transfer] = await tx.select().from(transfers).where(eq(transfers.id, transferId)).for('update');
  if (!transfer) throw new NotFoundError('Transfer', transferId);
  if (transfer.status !== 'in_transit') throw new DomainError('TRANSFER_NOT_IN_TRANSIT', `Transfer ${transfer.docNo} yolda değil (durum: ${transfer.status})`);
  const lines = await tx.select().from(transferLines).where(eq(transferLines.transferId, transferId));
  const transit = await getTransitLocation(tx, transfer.fromWarehouseId);
  const movedAt = new Date();

  for (const line of lines) {
    await postStockMove(tx, {
      kind: 'transfer', productId: line.productId, lotId: line.lotId, fromLocationId: transit.id, toLocationId: line.toLocationId,
      qty: D(line.qty), uomId: line.uomId, refType: 'transfer', refId: transferId, refLineId: line.id, refNo: transfer.docNo, origin: transfer.origin, movedAt,
    }, ctx);
  }
  const [updated] = await tx.update(transfers).set({ status: 'done', doneAt: movedAt, updatedBy: ctx.userId ?? null }).where(eq(transfers.id, transferId)).returning();
  await indexDocument(tx, { type: 'transfer', recordId: transferId, docNo: transfer.docNo, status: 'done', origin: transfer.origin, title: `Transfer ${transfer.docNo}` });
  return { transfer: updated!, lines };
}

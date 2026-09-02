import type { Tx } from '@plantero/db';
import { createLot, postStockMove } from './ledger.js';
import { ctx, d, type Base } from '../__tests__/helpers.js';
import type { LotStatus } from '../types.js';

/** Yeni core stok testleri için ortak yardımcı: hammadde mal kabulü simüle eder (ledger üzerinden). */
export async function receiveRawHelper(
  tx: Tx, b: Base, lotNo: string, qty: string, unitCost: string,
  opts: { expiryDate?: string; toLocationId?: string; status?: LotStatus } = {},
) {
  const lot = await createLot(tx, { productId: b.raw.id, lotNo, origin: 'receipt', supplierId: b.supplier.id, expiryDate: opts.expiryDate ?? null, status: opts.status }, ctx);
  const res = await postStockMove(tx, {
    kind: 'receipt', productId: b.raw.id, lotId: lot.id, fromLocationId: b.loc.sup.id, toLocationId: opts.toLocationId ?? b.loc.kar.id,
    qty: d(qty), uomId: b.kg.id, unitCost: d(unitCost), refType: 'receipt', refId: '00000000-0000-4000-8000-000000000001', refNo: 'GR-TEST', partnerId: b.supplier.id,
  }, ctx);
  return { lot, res };
}

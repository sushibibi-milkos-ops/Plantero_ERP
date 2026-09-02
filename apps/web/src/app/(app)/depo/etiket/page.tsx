import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@plantero/db';
import { getLotLabelData, getLocationLabelData } from '@plantero/core';
import { requirePermission } from '@/lib/auth';
import { PrintLabel, type LabelPayload } from '@/modules/stock/components/print-label';

export const metadata: Metadata = { title: 'Etiket' };
export const dynamic = 'force-dynamic';

export default async function LabelPage({ searchParams }: { searchParams: Promise<{ lot?: string; loc?: string }> }) {
  await requirePermission('stock.view');
  const { lot, loc } = await searchParams;

  let payload: LabelPayload | null = null;
  if (lot) {
    const data = await getLotLabelData(db, lot).catch(() => null);
    if (data) payload = { kind: 'lot', lotNo: data.lotNo, qrText: data.qrText, productName: data.productName, sku: data.sku, expiryDate: data.expiryDate, qty: data.qty, uom: data.uom, supplierLotNo: data.supplierLotNo };
  } else if (loc) {
    const data = await getLocationLabelData(db, loc).catch(() => null);
    if (data) payload = { kind: 'location', code: data.code, qrText: data.qrText, name: data.name, warehouseCode: data.warehouseCode };
  }

  if (!payload) notFound();
  return <PrintLabel label={payload} />;
}

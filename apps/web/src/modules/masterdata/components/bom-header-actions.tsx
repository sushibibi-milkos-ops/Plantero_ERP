'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Archive, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { activateBomAction, archiveBomAction, createBomVersionAction } from '../actions';

export type BomHeaderActionsBom = {
  id: string;
  productId: string;
  status: string;
  name: string | null;
  outputQty: string;
  expectedYieldPct: string;
  overheadPerBatch: string;
  overheadPerUnit: string;
  note: string | null;
};
export type BomHeaderActionsLine = { productId: string; qty: string; uomId: string; scrapPct: string; isByproduct: boolean };

/**
 * Reçete detay başlığının sağındaki tek eylem grubu (Aktifleştir | Yeni versiyon + Arşivle).
 * Ayrı bir istemci bileşeni olmasının nedeni: `PageHeader.actions` sunucu bileşeninden geçirilir,
 * bu yüzden düğmeler `BomDetailForm`'un (gövde) form durumundan bağımsız çalışmalı.
 */
export function BomHeaderActions({ bom, lines }: { bom: BomHeaderActionsBom; lines: BomHeaderActionsLine[] }) {
  const router = useRouter();
  const isDraft = bom.status === 'draft';

  async function onActivate() {
    const res = await activateBomAction({ id: bom.id });
    if (res.ok) toast.success(`Reçete aktifleştirildi: ${res.data.code}`);
    else toast.error(res.error);
  }

  async function onArchive() {
    const res = await archiveBomAction({ id: bom.id });
    if (res.ok) toast.success('Reçete arşivlendi');
    else toast.error(res.error);
  }

  async function onNewVersion() {
    const res = await createBomVersionAction({
      productId: bom.productId,
      name: bom.name,
      outputQty: bom.outputQty,
      expectedYieldPct: bom.expectedYieldPct,
      overheadPerBatch: bom.overheadPerBatch,
      overheadPerUnit: bom.overheadPerUnit,
      note: bom.note,
      lines,
    });
    if (res.ok) {
      toast.success(`Yeni versiyon oluşturuldu: ${res.data.code}`);
      router.push(`/ana-veri/receteler/${res.data.id}`);
    } else toast.error(res.error);
  }

  if (isDraft) {
    return (
      <Button onClick={onActivate} size="sm" className="max-md:h-11">
        <CheckCircle2 className="size-4" /> Aktifleştir
      </Button>
    );
  }

  return (
    <>
      <Button onClick={onNewVersion} variant="outline" size="sm" className="max-md:h-11">
        <Copy className="size-4" /> Yeni versiyon
      </Button>
      {bom.status === 'active' ? (
        <Button onClick={onArchive} variant="outline" size="sm" className="max-md:h-11">
          <Archive className="size-4" /> Arşivle
        </Button>
      ) : null}
    </>
  );
}

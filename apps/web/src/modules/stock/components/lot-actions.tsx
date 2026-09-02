'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Printer, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Combobox, type ComboboxOption } from '@/components/form/combobox';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { releaseLotAction, rejectLotAction } from '../actions';

export function LotActions({
  lotId,
  quarantineQty,
  internalLocations,
  rejectedLocations,
}: {
  lotId: string;
  quarantineQty: string;
  internalLocations: ComboboxOption[];
  rejectedLocations: ComboboxOption[];
}) {
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [toLocationId, setToLocationId] = useState<string | null>(internalLocations[0]?.value ?? null);
  const [rejectedLocationId, setRejectedLocationId] = useState<string | null>(rejectedLocations[0]?.value ?? null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConfirmDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        title="Lotu serbest bırak"
        description={`Karantinadaki ${quarantineQty} miktar hedef lokasyona taşınır ve lot 'serbest' durumuna geçer.`}
        confirmLabel="Serbest bırak"
        onConfirm={async () => {
          if (!toLocationId) return { ok: false, error: 'Hedef lokasyon seçin' };
          const res = await releaseLotAction({ lotId, toLocationId, note: note || null });
          if (res.ok) toast.success('Lot serbest bırakıldı');
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Hedef lokasyon</Label>
            <Combobox value={toLocationId} onChange={setToLocationId} options={internalLocations} mono placeholder="Lokasyon seçin" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Not (opsiyonel)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
      </ConfirmDialog>
      <Button variant="outline" onClick={() => setReleaseOpen(true)}>
        <CheckCircle2 className="size-4" /> Serbest bırak
      </Button>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Lotu reddet"
        description="Karantinadaki miktar RED lokasyonuna taşınır; lot bir daha müşteriye/üretime çıkamaz (fire/iade hariç)."
        confirmLabel="Reddet"
        destructive
        onConfirm={async () => {
          if (!rejectedLocationId) return { ok: false, error: 'Hedef lokasyon seçin' };
          if (!reason.trim()) return { ok: false, error: 'Red gerekçesi gerekli' };
          const res = await rejectLotAction({ lotId, rejectedLocationId, reason });
          if (res.ok) toast.success('Lot reddedildi');
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Red lokasyonu</Label>
            <Combobox value={rejectedLocationId} onChange={setRejectedLocationId} options={rejectedLocations} mono placeholder="Lokasyon seçin" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Gerekçe</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Örn. nem oranı yüksek" />
          </div>
        </div>
      </ConfirmDialog>
      <Button variant="outline" onClick={() => setRejectOpen(true)}>
        <XCircle className="size-4" /> Reddet
      </Button>

      <Button variant="outline" asChild>
        <Link href={`/depo/etiket?lot=${lotId}`} target="_blank">
          <Printer className="size-4" /> Etiket yazdır
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/depo/transfer/yeni">
          <ArrowLeftRight className="size-4" /> Taşı
        </Link>
      </Button>
    </div>
  );
}

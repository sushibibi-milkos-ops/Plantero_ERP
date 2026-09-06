'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/form/date-field';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatDate } from '@/lib/format';
import { updateShipmentLogisticsAction } from '../actions';

const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'] as const;
type Incoterm = (typeof INCOTERMS)[number];
const TRANSPORT_LABEL: Record<string, string> = { road: 'Karayolu', sea: 'Deniz yolu', air: 'Hava yolu', courier: 'Kurye/kargo' };

type Field = { label: string; value: string | null };

function InfoField({ label, value }: Field) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-[13px] font-medium">{value || <span className="font-normal text-muted-foreground">—</span>}</div>
    </div>
  );
}

export function LogisticsPanel({
  shipmentId, incoterm, incotermPlace, destinationCountry, portOfLoading, portOfDischarge, transportMode, carrier, trackingNo, etd, eta, editable,
}: {
  shipmentId: string; incoterm: string; incotermPlace: string | null; destinationCountry: string; portOfLoading: string | null;
  portOfDischarge: string | null; transportMode: string | null; carrier: string | null; trackingNo: string | null; etd: string | null; eta: string | null;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ incoterm, incotermPlace: incotermPlace ?? '', destinationCountry, portOfLoading: portOfLoading ?? '', portOfDischarge: portOfDischarge ?? '', transportMode: transportMode ?? '', carrier: carrier ?? '', trackingNo: trackingNo ?? '', etd, eta });

  function openEdit() {
    setForm({ incoterm, incotermPlace: incotermPlace ?? '', destinationCountry, portOfLoading: portOfLoading ?? '', portOfDischarge: portOfDischarge ?? '', transportMode: transportMode ?? '', carrier: carrier ?? '', trackingNo: trackingNo ?? '', etd, eta });
    setOpen(true);
  }

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">Lojistik</h3>
        {/* Tur 2 P1 ihracat-detay-07 kök neden: bu düğme 390px'te 28px'te sabitti — sayfada lojistik
            bilgilerini değiştirmenin TEK yolu, diğer tüm eylemler (Yüklendi işaretle, İptal et,
            sekmeler, satır eylemleri) ≥44px iken bu ikisi <44px'ti. Mobilde 44px (`h-11`),
            masaüstünde yoğunluk için 28px (`md:h-7`) korunur. */}
        {editable ? (
          <Button variant="ghost" size="sm" onClick={openEdit} className="h-11 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground md:h-7">
            <Pencil className="size-3.5" /> Düzenle
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <InfoField label="Incoterm" value={incotermPlace ? `${incoterm} — ${incotermPlace}` : incoterm} />
        <InfoField label="Varış ülkesi" value={destinationCountry} />
        <InfoField label="Taşıma modu" value={transportMode ? (TRANSPORT_LABEL[transportMode] ?? transportMode) : null} />
        <InfoField label="Yükleme noktası" value={portOfLoading} />
        <InfoField label="Varış noktası" value={portOfDischarge} />
        <InfoField label="Nakliyeci" value={carrier} />
        <InfoField label="Takip no" value={trackingNo} />
        <InfoField label="ETD" value={etd ? formatDate(etd) : null} />
        <InfoField label="ETA" value={eta ? formatDate(eta) : null} />
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Lojistik bilgilerini düzenle"
        confirmLabel="Kaydet"
        onConfirm={async () => {
          const res = await updateShipmentLogisticsAction({
            id: shipmentId, incoterm: form.incoterm as Incoterm, incotermPlace: form.incotermPlace || null,
            destinationCountry: form.destinationCountry || undefined, portOfLoading: form.portOfLoading || null, portOfDischarge: form.portOfDischarge || null,
            transportMode: form.transportMode || null, carrier: form.carrier || null, trackingNo: form.trackingNo || null, etd: form.etd || null, eta: form.eta || null,
          });
          if (res.ok) toast.success('Lojistik bilgileri güncellendi');
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Incoterm</Label>
            <Select value={form.incoterm} onValueChange={(v) => setForm((f) => ({ ...f, incoterm: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{INCOTERMS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Incoterm yeri</Label>
            <Input value={form.incotermPlace} onChange={(e) => setForm((f) => ({ ...f, incotermPlace: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Varış ülkesi (ISO-2)</Label>
            <Input value={form.destinationCountry} maxLength={2} onChange={(e) => setForm((f) => ({ ...f, destinationCountry: e.target.value.toUpperCase() }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Taşıma modu</Label>
            <Select value={form.transportMode || undefined} onValueChange={(v) => setForm((f) => ({ ...f, transportMode: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>{Object.entries(TRANSPORT_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Yükleme noktası</Label>
            <Input value={form.portOfLoading} onChange={(e) => setForm((f) => ({ ...f, portOfLoading: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Varış noktası</Label>
            <Input value={form.portOfDischarge} onChange={(e) => setForm((f) => ({ ...f, portOfDischarge: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Nakliyeci</Label>
            <Input value={form.carrier} onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Takip no</Label>
            <Input value={form.trackingNo} onChange={(e) => setForm((f) => ({ ...f, trackingNo: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">ETD</Label>
            <DateInput value={form.etd} onChange={(v) => setForm((f) => ({ ...f, etd: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">ETA</Label>
            <DateInput value={form.eta} onChange={(v) => setForm((f) => ({ ...f, eta: v }))} />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}

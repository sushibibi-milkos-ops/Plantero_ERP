'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/form/combobox';
import { DateInput } from '@/components/form/date-field';
import { Label } from '@/components/ui/label';
import { createCountAction } from '../actions';

type LocationOption = { id: string; code: string; usage: string; warehouseId: string | null };

export function CreateCountDialog({
  warehouses,
  locations,
  trigger,
}: {
  warehouses: Array<{ id: string; code: string; name: string }>;
  locations: LocationOption[];
  /** Varsayılan tetikleyici (PageHeader birincil butonu) yerine özel bir tetikleyici — ör.
   *  `NextStepHint`in "add item" satırı içindeki metin bağlantısı (Tur 5 P2 bulgusu). Düz bir
   *  `ReactNode` (fonksiyon DEĞİL) — bu bileşen bir sunucu bileşeninden ('use client' olmayan
   *  sayfa) çağrılıyor; bir render-prop fonksiyonu sunucu→istemci sınırını (RSC serileştirme)
   *  ihlal ederdi ("Functions cannot be passed directly to Client Components"). Tıklama işleyicisi
   *  bunun yerine burada, istemci tarafında, sarmalayıcı bir `<span>` üzerinden eklenir. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Varsayılan depo: üretim tesisi (TIRE) — sayımların büyük çoğunluğu orada yapılır.
  const [warehouseId, setWarehouseId] = useState<string | null>(warehouses.find((w) => w.code === 'TIRE')?.id ?? warehouses[0]?.id ?? null);
  const [scopeLocationId, setScopeLocationId] = useState<string | null>(null);
  const [countDate, setCountDate] = useState<string | null>(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const scopeOptions = useMemo(() => locations.filter((l) => l.usage === 'internal' && l.warehouseId === warehouseId).map((l) => ({ value: l.id, label: l.code })), [locations, warehouseId]);

  async function onCreate() {
    if (!warehouseId || !countDate) return;
    setPending(true);
    const res = await createCountAction({ warehouseId, scopeLocationId, countDate });
    setPending(false);
    if (res.ok) {
      toast.success(`Sayım oluşturuldu: ${res.data.docNo}`);
      setOpen(false);
      router.push(`/depo/sayim/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <span className="contents" onClick={() => setOpen(true)}>
          {trigger}
        </span>
      ) : (
        // Sözleşme: sayım ekranında dokunma hedefi ≥44px (docs/modules/depo.md kabul kriterleri)
        <Button className="h-11 md:h-9" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Yeni sayım
        </Button>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni sayım</DialogTitle>
          <DialogDescription>Depo (opsiyonel kapsam lokasyonu) ve sayım tarihi seçin; görüntü sonraki adımda alınır.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Depo</Label>
            <Combobox value={warehouseId} onChange={(v) => { setWarehouseId(v); setScopeLocationId(null); }} options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} clearable={false} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Kapsam lokasyonu (opsiyonel — boş = tüm depo)</Label>
            <Combobox value={scopeLocationId} onChange={setScopeLocationId} options={scopeOptions} mono placeholder="Tüm depo" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Sayım tarihi</Label>
            <DateInput value={countDate} onChange={setCountDate} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Vazgeç</Button>
          <Button onClick={onCreate} disabled={pending || !warehouseId}>Oluştur</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

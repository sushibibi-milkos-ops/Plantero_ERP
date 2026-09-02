'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/form/combobox';
import { Label } from '@/components/ui/label';
import { createDeliveryAction } from '../actions';

export function CreateDeliveryDialog({ orders }: { orders: Array<{ id: string; docNo: string; partnerName: string }> }) {
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onCreate() {
    if (!orderId) return;
    setPending(true);
    const res = await createDeliveryAction({ salesOrderId: orderId });
    setPending(false);
    if (res.ok) {
      toast.success(`İrsaliye oluşturuldu: ${res.data.docNo}`);
      setOpen(false);
      router.push(`/depo/sevkiyat/${res.data.id}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Yeni irsaliye
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Siparişten irsaliye oluştur</DialogTitle>
          <DialogDescription>Onaylanmış bir satış siparişinin teslim edilmemiş satırlarından taslak irsaliye oluşturulur.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-[13px]">Satış siparişi</Label>
          <Combobox
            value={orderId}
            onChange={setOrderId}
            options={orders.map((o) => ({ value: o.id, label: o.docNo, description: o.partnerName }))}
            placeholder="Sipariş seçin"
            emptyText={orders.length ? 'Sonuç yok' : 'Sevk edilecek sipariş yok'}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Vazgeç</Button>
          <Button onClick={onCreate} disabled={!orderId || pending}>Oluştur</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { FileText, Package, Truck, ShipWheel, CheckCircle2, Ban, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  generateProformaAction, linkDeliveryAction, buildPackingListAction, advanceToCustomsAction,
  markShippedAction, markShipmentDeliveredAction, linkInvoiceAction, closeShipmentAction, cancelShipmentAction,
} from '../actions';

type Candidate = { id: string; docNo: string; label?: string };

export function ShipmentActions({
  shipmentId, status, regime, deliveryId, invoiceId, deliveryCandidates, invoiceCandidates,
}: {
  shipmentId: string;
  status: string;
  regime: 'standard' | 'etgb';
  deliveryId: string | null;
  invoiceId: string | null;
  deliveryCandidates: Candidate[];
  invoiceCandidates: Candidate[];
}) {
  const router = useRouter();
  const [linkDeliveryOpen, setLinkDeliveryOpen] = useState(false);
  const [linkInvoiceOpen, setLinkInvoiceOpen] = useState(false);
  const [customsOpen, setCustomsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [customsDeclarationNo, setCustomsDeclarationNo] = useState('');
  const [etgbNo, setEtgbNo] = useState('');
  const [reason, setReason] = useState('');

  function refresh() {
    router.refresh();
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    const res = await action();
    if (res.ok) {
      toast.success(successMessage);
      refresh();
    } else {
      toast.error(res.error);
    }
  }

  const cancellable = !['closed', 'cancelled'].includes(status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === 'draft' || status === 'proforma_sent') && (
        <Button variant={status === 'draft' ? 'default' : 'outline'} onClick={() => run(() => generateProformaAction({ id: shipmentId }), 'Proforma gönderildi')}>
          <FileText className="size-4" /> {status === 'draft' ? 'Proforma gönder' : 'Proforma yenile'}
        </Button>
      )}

      {!deliveryId && deliveryCandidates.length > 0 && (
        <>
          <ConfirmDialog
            open={linkDeliveryOpen}
            onOpenChange={setLinkDeliveryOpen}
            title="İrsaliyeye bağla"
            description="Çeki listesi bu irsaliyenin satırlarından üretilecek."
            confirmLabel="Bağla"
            onConfirm={async () => {
              if (!selectedDelivery) return { ok: false, error: 'İrsaliye seçin' };
              const res = await linkDeliveryAction({ id: shipmentId, deliveryId: selectedDelivery });
              if (res.ok) { toast.success('İrsaliyeye bağlandı'); refresh(); }
              return res.ok ? undefined : { ok: false, error: res.error };
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-[13px]">İrsaliye</Label>
              <Select value={selectedDelivery} onValueChange={setSelectedDelivery}>
                <SelectTrigger className="w-full"><SelectValue placeholder="İrsaliye seçin" /></SelectTrigger>
                <SelectContent>
                  {deliveryCandidates.map((d) => <SelectItem key={d.id} value={d.id}>{d.docNo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </ConfirmDialog>
          <Button variant="outline" onClick={() => setLinkDeliveryOpen(true)}>
            <Link2 className="size-4" /> İrsaliyeye bağla
          </Button>
        </>
      )}

      {deliveryId && ['confirmed', 'packing'].includes(status) && (
        <Button onClick={() => run(() => buildPackingListAction({ id: shipmentId }), 'Çeki listesi kuruldu')}>
          <Package className="size-4" /> {status === 'packing' ? 'Çeki listesini yenile' : 'Çeki listesi oluştur'}
        </Button>
      )}

      {['packing', 'customs'].includes(status) && (
        <>
          <ConfirmDialog
            open={customsOpen}
            onOpenChange={setCustomsOpen}
            title="Gümrük işlemine al"
            description={regime === 'etgb' ? 'ETGB rejiminde ETGB numarası gerekli.' : 'Standart rejimde gümrük beyanname numarası gerekli.'}
            confirmLabel="Gümrüğe al"
            onConfirm={async () => {
              const res = await advanceToCustomsAction({ id: shipmentId, customsDeclarationNo: customsDeclarationNo || null, etgbNo: etgbNo || null });
              if (res.ok) { toast.success('Gümrük işlemine alındı'); refresh(); }
              return res.ok ? undefined : { ok: false, error: res.error };
            }}
          >
            <div className="space-y-3">
              {regime === 'etgb' ? (
                <div className="space-y-1.5">
                  <Label className="text-[13px]">ETGB no</Label>
                  <Input value={etgbNo} onChange={(e) => setEtgbNo(e.target.value)} placeholder="ETGB2026DE00123" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Gümrük beyanname no</Label>
                  <Input value={customsDeclarationNo} onChange={(e) => setCustomsDeclarationNo(e.target.value)} placeholder="GB2026000045" />
                </div>
              )}
            </div>
          </ConfirmDialog>
          <Button variant="outline" onClick={() => setCustomsOpen(true)}>
            <ShipWheel className="size-4" /> {status === 'customs' ? 'Gümrük bilgisini güncelle' : 'Gümrüğe al'}
          </Button>
        </>
      )}

      {status === 'customs' && (
        <Button onClick={() => run(() => markShippedAction({ id: shipmentId }), 'Yüklendi olarak işaretlendi')}>
          <Truck className="size-4" /> Yüklendi işaretle
        </Button>
      )}

      {status === 'shipped' && (
        <Button variant="outline" onClick={() => run(() => markShipmentDeliveredAction({ id: shipmentId }), 'Teslim edildi olarak işaretlendi')}>
          <CheckCircle2 className="size-4" /> Teslim edildi işaretle
        </Button>
      )}

      {!invoiceId && ['shipped', 'delivered'].includes(status) && invoiceCandidates.length > 0 && (
        <>
          <ConfirmDialog
            open={linkInvoiceOpen}
            onOpenChange={setLinkInvoiceOpen}
            title="Faturaya bağla"
            description="Sevkiyat sipariş/irsaliye üzerinden zaten oluşmuş ihracat faturasına bağlanır."
            confirmLabel="Bağla"
            onConfirm={async () => {
              if (!selectedInvoice) return { ok: false, error: 'Fatura seçin' };
              const res = await linkInvoiceAction({ id: shipmentId, invoiceId: selectedInvoice });
              if (res.ok) { toast.success('Faturaya bağlandı'); refresh(); }
              return res.ok ? undefined : { ok: false, error: res.error };
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-[13px]">Fatura</Label>
              <Select value={selectedInvoice} onValueChange={setSelectedInvoice}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Fatura seçin" /></SelectTrigger>
                <SelectContent>
                  {invoiceCandidates.map((i) => <SelectItem key={i.id} value={i.id}>{i.docNo}{i.label ? ` — ${i.label}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </ConfirmDialog>
          <Button variant="outline" onClick={() => setLinkInvoiceOpen(true)}>
            <Link2 className="size-4" /> Faturaya bağla
          </Button>
        </>
      )}

      {invoiceId && ['shipped', 'delivered'].includes(status) && (
        <Button onClick={() => run(() => closeShipmentAction({ id: shipmentId }), 'Sevkiyat kapatıldı')}>
          <CheckCircle2 className="size-4" /> Kapat
        </Button>
      )}

      {cancellable && (
        <>
          <ConfirmDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title="Sevkiyatı iptal et"
            description="Bu işlem geri alınamaz; sipariş sevkiyat bağı kaldırılır."
            confirmLabel="İptal et"
            destructive
            onConfirm={async () => {
              const res = await cancelShipmentAction({ id: shipmentId, reason: reason || null });
              if (res.ok) { toast.success('Sevkiyat iptal edildi'); refresh(); }
              return res.ok ? undefined : { ok: false, error: res.error };
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-[13px]">Gerekçe (opsiyonel)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </ConfirmDialog>
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setCancelOpen(true)}>
            <Ban className="size-4" /> İptal et
          </Button>
        </>
      )}
    </div>
  );
}

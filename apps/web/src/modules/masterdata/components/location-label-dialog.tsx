'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Printer, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { updateLocationAction } from '../actions';

const schema = z.object({ barcode: z.string().trim().optional().nullable() });
type FormValues = z.infer<typeof schema>;

/**
 * Lokasyon etiket dialogu: QR (`LOC:<code>`) önizlemesi + yazdır, ve barkod atama formu.
 * Yazdırma tarayıcının `window.print()`'i ile yapılır; `@media print` yalnızca etiketi gösterir.
 */
export function LocationLabelDialog({
  open,
  onOpenChange,
  id,
  code,
  name,
  barcode,
  canManage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  canManage: boolean;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { barcode } });

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(`LOC:${code}`, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
    form.reset({ barcode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, code]);

  async function onSubmit(values: FormValues) {
    const res = await updateLocationAction({ id, ...values });
    if (res.ok) toast.success('Barkod güncellendi');
    else toast.error(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="print:m-0 print:max-w-none print:border-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4" /> Lokasyon etiketi
          </DialogTitle>
          <DialogDescription>QR: LOC:{code}</DialogDescription>
        </DialogHeader>

        <div id="location-print-label" className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 print:border-0">
          {/* QR bir data: URI (istemcide üretilir, yazdırma diyaloğunda kullanılır) — next/image optimizasyonu uygulanamaz */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt={`QR ${code}`} className="size-40" /> : <div className="size-40 animate-pulse rounded bg-muted" />}
          <div className="font-mono text-lg font-semibold">{code}</div>
          <div className="text-sm text-muted-foreground">{name}</div>
        </div>

        <DialogFooter className="print:hidden">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Yazdır
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Kapat
            </Button>
          </DialogClose>
        </DialogFooter>

        {canManage ? (
          <div className="border-t border-border/60 pt-3 print:hidden">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-end gap-2">
                <FormText control={form.control} name="barcode" label="Barkod ata" mono className="flex-1" />
                <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Kaydet" />
              </form>
            </Form>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

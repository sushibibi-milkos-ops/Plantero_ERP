'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerTrigger, DrawerClose } from '@/components/ui/drawer';
import { Form, FormSwitch } from '@/components/form/fields';
import { FormMoney, FormQty } from '@/components/form/money-qty';
import { updateChannelSettingsAction } from '../actions';
import type { salesChannels } from '@plantero/db';

const schema = z.object({
  commissionPct: z.string().min(1), shippingDeductionPerOrder: z.string().min(1), otherDeductionPct: z.string().min(1),
  settlementDays: z.string().min(1), syncEnabled: z.boolean(),
});

export function ChannelSettingsDrawer({ channel }: { channel: typeof salesChannels.$inferSelect }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      commissionPct: channel.commissionPct, shippingDeductionPerOrder: channel.shippingDeductionPerOrder, otherDeductionPct: channel.otherDeductionPct,
      settlementDays: String(channel.settlementDays), syncEnabled: channel.syncEnabled,
    },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    const res = await updateChannelSettingsAction({ id: channel.id, commissionPct: values.commissionPct, shippingDeductionPerOrder: values.shippingDeductionPerOrder, otherDeductionPct: values.otherDeductionPct, settlementDays: Number(values.settlementDays), syncEnabled: values.syncEnabled });
    if (res.ok) {
      toast.success(`${channel.name} ayarları güncellendi`);
      setOpen(false);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      <DrawerTrigger asChild>
        {/* max-md:size-11: mobil kartta bu buton doğrudan (DataTableRowActions'ın 44px düzeltmesini
            baypas ederek) render ediliyor — 32px masaüstü yoğunluğu, 44px mobil dokunma hedefi (Tur 3 P1). */}
        <Button variant="outline" size="icon-sm" className="max-md:size-11" aria-label="Kanal ayarları">
          <Settings2 className="size-3.5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="w-full sm:max-w-sm">
        <DrawerHeader>
          <DrawerTitle>{channel.name} — ayarlar</DrawerTitle>
          <DrawerDescription>Komisyon, kargo kesintisi ve senkron ayarları net ciro hesabını etkiler.</DrawerDescription>
        </DrawerHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <FormQty control={form.control} name="commissionPct" label="Komisyon %" uom="%" maxDigits={2} />
            <FormMoney control={form.control} name="shippingDeductionPerOrder" label="Sipariş başı kargo kesintisi" />
            <FormQty control={form.control} name="otherDeductionPct" label="Diğer kesinti %" uom="%" maxDigits={2} />
            <FormQty control={form.control} name="settlementDays" label="Hakediş vadesi (gün)" maxDigits={0} />
            <FormSwitch control={form.control} name="syncEnabled" label="Otomatik senkron" description="Pazaryeri siparişleri periyodik çekilsin" />
            <DrawerFooter className="px-0">
              <Button type="submit" disabled={form.formState.isSubmitting}>Kaydet</Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost">Vazgeç</Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </Form>
      </DrawerContent>
    </Drawer>
  );
}

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormCheckbox } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/empty-state';
import { initials } from '@/lib/format';
import { addPartnerContactAction } from '../actions';

export type ContactRow = { id: string; fullName: string; title: string | null; email: string | null; phone: string | null; whatsapp: string | null; isPrimary: boolean };

const schema = z.object({ fullName: z.string().trim().min(2), title: z.string().optional().nullable(), email: z.string().optional().nullable(), phone: z.string().optional().nullable(), isPrimary: z.boolean() });
type FormValues = z.infer<typeof schema>;

export function PartnerContactsTab({ partnerId, contacts, canManage }: { partnerId: string; contacts: ContactRow[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { fullName: '', title: '', email: '', phone: '', isPrimary: contacts.length === 0 } });

  async function onSubmit(values: FormValues) {
    const res = await addPartnerContactAction({ partnerId, ...values });
    if (res.ok) {
      toast.success('Kişi eklendi');
      setOpen(false);
      form.reset({ fullName: '', title: '', email: '', phone: '', isPrimary: false });
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Kişiler</div>
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Kişi ekle
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Kişi ekle</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormText control={form.control} name="fullName" label="Ad Soyad" required />
                  <FormText control={form.control} name="title" label="Görev" />
                  <div className="grid grid-cols-2 gap-3">
                    <FormText control={form.control} name="email" label="E-posta" type="email" />
                    <FormText control={form.control} name="phone" label="Telefon" />
                  </div>
                  <FormCheckbox control={form.control} name="isPrimary" label="Birincil kişi" />
                  <DialogFooter>
                    <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Ekle">
                      <DialogClose asChild>
                        <Button type="button" variant="ghost">
                          Vazgeç
                        </Button>
                      </DialogClose>
                    </FormActions>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {contacts.length === 0 ? (
        <EmptyState compact title="Kişi yok" description="Bu cari için henüz bir yetkili kişi eklenmedi." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-3">
              <Avatar className="size-8 border">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">{initials(c.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  {c.fullName}
                  {c.isPrimary ? <Star className="size-3 fill-primary text-primary" /> : null}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">{[c.title, c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

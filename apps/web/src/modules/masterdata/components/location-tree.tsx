'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronRight, Plus, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormSelect, FormCheckbox } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { cn } from '@/lib/utils';
import { createLocationAction } from '../actions';
import { LOCATION_USAGE_LABELS } from '../product-labels';
import { LocationLabelDialog } from './location-label-dialog';
import type { LocationTreeNode } from '@plantero/core';

const USAGE_TONE: Record<string, 'neutral' | 'warning' | 'danger' | 'primary' | 'muted' | 'info'> = {
  internal: 'neutral', quarantine: 'warning', rejected: 'danger', production: 'primary',
  supplier: 'muted', customer: 'muted', inventory_loss: 'danger', scrap: 'danger', transit: 'info', view: 'muted',
};

function Node({ node, depth, warehouseId, canManage }: { node: LocationTreeNode; depth: number; warehouseId: string; canManage: boolean }) {
  const [open, setOpen] = useState(depth < 1);
  const [addOpen, setAddOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div className={cn('group flex h-10 items-center gap-2 rounded-md px-2 hover:bg-accent/50', 'border-b border-border/40 last:border-0')} style={{ paddingLeft: depth * 20 + 8 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn('grid size-5 shrink-0 place-items-center rounded text-muted-foreground', !hasChildren && 'invisible')}
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-150 ease-out', open && 'rotate-90')} />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{node.code}</span>
        <span className="hidden truncate text-[12px] text-muted-foreground sm:inline">{node.name}</span>
        <StatusBadge status={node.usage} label={LOCATION_USAGE_LABELS[node.usage] ?? node.usage} tone={USAGE_TONE[node.usage] ?? 'neutral'} size="sm" />
        <span className="w-24 text-right">
          <QtyCell value={node.totalQty} maxDigits={1} />
        </span>
        <span className="w-28 text-right">
          <MoneyCell value={node.totalValue} muted />
        </span>
        <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100" onClick={() => setLabelOpen(true)} title="Etiket yazdır / barkod ata">
          <Tag className="size-3.5" />
        </Button>
        <LocationLabelDialog open={labelOpen} onOpenChange={setLabelOpen} id={node.id} code={node.code} name={node.name} barcode={node.barcode} canManage={canManage} />
        {canManage ? (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100" onClick={() => setAddOpen(true)} title="Alt lokasyon ekle">
              <Plus className="size-3.5" />
            </Button>
            <LocationFormDialog warehouseId={warehouseId} parentId={node.id} parentCode={node.code} onDone={() => setAddOpen(false)} />
          </Dialog>
        ) : null}
      </div>
      {open && hasChildren ? (
        <div>
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} warehouseId={warehouseId} canManage={canManage} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const createSchema = z.object({
  segment: z.string().trim().min(1, 'Kod segmenti gerekli'),
  name: z.string().trim().min(1, 'Ad gerekli'),
  usage: z.enum(['internal', 'quarantine', 'rejected', 'production', 'supplier', 'customer', 'inventory_loss', 'scrap', 'transit', 'view']),
  isPickable: z.boolean(),
});
type CreateFormValues = z.infer<typeof createSchema>;

function LocationFormDialog({ warehouseId, parentId, parentCode, onDone }: { warehouseId: string; parentId?: string; parentCode?: string; onDone: () => void }) {
  const form = useForm<CreateFormValues>({ resolver: zodResolver(createSchema), defaultValues: { segment: '', name: '', usage: 'internal', isPickable: true } });

  async function onSubmit(values: CreateFormValues) {
    const res = await createLocationAction({ warehouseId, parentId, ...values });
    if (res.ok) {
      toast.success(`Lokasyon oluşturuldu: ${res.data.code}`);
      onDone();
      form.reset({ segment: '', name: '', usage: 'internal', isPickable: true });
    } else toast.error(res.error);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Yeni lokasyon</DialogTitle>
      </DialogHeader>
      {parentCode ? <p className="-mt-2 text-[12px] text-muted-foreground">Üst: <span className="font-mono">{parentCode}</span></p> : null}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormText control={form.control} name="segment" label="Kod segmenti" mono placeholder="ör. R04" required />
          <FormText control={form.control} name="name" label="Ad" required />
          <FormSelect
            control={form.control}
            name="usage"
            label="Kullanım"
            options={Object.entries(LOCATION_USAGE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FormCheckbox control={form.control} name="isPickable" label="Toplama yapılabilir (pickable)" />
          <DialogFooter>
            <FormActions pending={form.formState.isSubmitting} sticky={false} submitLabel="Oluştur">
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
  );
}

export function LocationTree({ warehouseId, tree, canManage }: { warehouseId: string; tree: LocationTreeNode[]; canManage: boolean }) {
  const [rootAddOpen, setRootAddOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex h-9 items-center gap-2 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span className="w-5" />
          <span className="flex-1">Kod / Ad</span>
          <span className="w-[76px] text-center">Durum</span>
          <span className="w-24 text-right">Miktar</span>
          <span className="w-28 text-right">Değer</span>
          <span className="w-7" />
        </div>
        {canManage ? (
          <Dialog open={rootAddOpen} onOpenChange={setRootAddOpen}>
            <Button size="sm" variant="outline" onClick={() => setRootAddOpen(true)}>
              <Plus className="size-4" /> Kök lokasyon ekle
            </Button>
            <LocationFormDialog warehouseId={warehouseId} onDone={() => setRootAddOpen(false)} />
          </Dialog>
        ) : null}
      </div>
      <div className="rounded-lg border border-border/70 bg-card p-1">
        {tree.map((n) => (
          <Node key={n.id} node={n} depth={0} warehouseId={warehouseId} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}


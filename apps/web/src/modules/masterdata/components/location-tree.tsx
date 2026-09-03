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

/** Data satırıyla başlık şeridinin tam aynı sütun genişliklerini paylaşması için ortak sabitler. */
const COL = { badge: 'w-24 shrink-0', qty: 'w-24 shrink-0 text-right', value: 'w-28 shrink-0 text-right' };

function Node({ node, depth, warehouseId, canManage }: { node: LocationTreeNode; depth: number; warehouseId: string; canManage: boolean }) {
  const [open, setOpen] = useState(depth < 1);
  const [addOpen, setAddOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  // "Depo" (internal) = varsayılan kullanım; rozet yalnızca istisnalarda (karantina/red/hurda/…) gösterilir —
  // aksi halde 22 satırın 14'ünde aynı gri rozet asıl istisnaları görsel olarak boğuyor.
  const usageBadge =
    node.usage === 'internal' ? null : (
      <StatusBadge status={node.usage} label={LOCATION_USAGE_LABELS[node.usage] ?? node.usage} tone={USAGE_TONE[node.usage] ?? 'neutral'} size="sm" />
    );
  const toggle = () => hasChildren && setOpen((o) => !o);

  return (
    <div>
      {/* ≥640px: tek satırlı tam sütunlu görünüm. 390px'te bunun yerine aşağıdaki iki satırlı kart kullanılır. */}
      <div
        className={cn('group hidden h-9 items-center gap-2 rounded-md px-2 hover:bg-accent/50 sm:flex', 'border-b border-border/50 last:border-0')}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button
          type="button"
          onClick={toggle}
          className={cn('grid size-5 shrink-0 place-items-center rounded text-muted-foreground', !hasChildren && 'invisible')}
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-150 ease-out', open && 'rotate-90')} />
        </button>
        {/* Kod + ad tek flex kolonu olarak — başlıktaki "Kod / Ad" tekli sütununa denk düşsün diye */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 font-mono text-[12px]">{node.code}</span>
          <span className="hidden min-w-0 truncate text-[12px] text-muted-foreground sm:inline">{node.name}</span>
        </div>
        <span className={COL.badge}>{usageBadge}</span>
        <span className={COL.qty}>
          <QtyCell value={node.totalQty} minDigits={2} maxDigits={2} />
        </span>
        <span className={COL.value}>
          <MoneyCell value={node.totalValue} />
        </span>
        <Button size="icon" variant="ghost" className="size-7 shrink-0 opacity-0 group-hover:opacity-100" onClick={() => setLabelOpen(true)} title="Etiket yazdır / barkod ata">
          <Tag className="size-3.5" />
        </Button>
        <LocationLabelDialog open={labelOpen} onOpenChange={setLabelOpen} id={node.id} code={node.code} name={node.name} barcode={node.barcode} canManage={canManage} />
        {canManage ? (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button size="icon" variant="ghost" className="size-7 shrink-0 opacity-0 group-hover:opacity-100" onClick={() => setAddOpen(true)} title="Alt lokasyon ekle">
              <Plus className="size-3.5" />
            </Button>
            <LocationFormDialog warehouseId={warehouseId} parentId={node.id} parentCode={node.code} onDone={() => setAddOpen(false)} />
          </Dialog>
        ) : null}
      </div>
      {/* 390px: iki satırlı kart — satırın tamamı dokunma hedefi (chevron yalnızca görsel gösterge, ≥44px). */}
      <div
        role={hasChildren ? 'button' : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={toggle}
        onKeyDown={hasChildren ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
        className={cn(
          'flex min-h-11 items-center gap-2 border-b border-border/50 px-2 py-1.5 last:border-0 sm:hidden',
          hasChildren && 'cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
        )}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <span className={cn('grid size-11 shrink-0 place-items-center rounded text-muted-foreground', !hasChildren && 'invisible')}>
          <ChevronRight className={cn('size-3.5 transition-transform duration-150 ease-out', open && 'rotate-90')} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[12px]">{node.code}</span>
            {usageBadge}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">{node.name}</span>
            <div className="flex shrink-0 items-baseline gap-2 text-[12px]">
              <QtyCell value={node.totalQty} minDigits={2} maxDigits={2} />
              <MoneyCell value={node.totalValue} />
            </div>
          </div>
        </div>
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

/** Bölüm başlığına (depo adı satırına) taşınan "kök lokasyon ekle" — LocationTree'nin başlık şeridinden ayrıldı. */
export function AddRootLocationButton({ warehouseId, canManage }: { warehouseId: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  if (!canManage) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="max-md:h-11" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Kök lokasyon ekle
      </Button>
      <LocationFormDialog warehouseId={warehouseId} onDone={() => setOpen(false)} />
    </Dialog>
  );
}

export function LocationTree({ warehouseId, tree, canManage }: { warehouseId: string; tree: LocationTreeNode[]; canManage: boolean }) {
  return (
    <div>
      {/* Başlık + gövde aynı anatomiyi paylaşır — DataTable ile aynı: kutu yok, yalnızca alttan hairline. */}
      <div className="hidden h-9 w-full items-center gap-2 border-b border-border/60 bg-muted/40 px-2 text-[12px] font-medium text-muted-foreground sm:flex">
        <span className="w-5 shrink-0" />
        <span className="min-w-0 flex-1">Kod / Ad</span>
        <span className={COL.badge}>Durum</span>
        <span className={COL.qty}>Miktar (karma birim)</span>
        <span className={COL.value}>Değer</span>
        {/* Etiket + (varsa) ekle simgeleriyle aynı toplam genişlik — satırlarla hizalansın diye */}
        <span className="shrink-0" style={{ width: canManage ? 64 : 28 }} />
      </div>
      <div>
        {tree.map((n) => (
          <Node key={n.id} node={n} depth={0} warehouseId={warehouseId} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

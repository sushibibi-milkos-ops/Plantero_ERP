'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronRight, Plus, Search, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormSelect, FormCheckbox } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { createLocationAction } from '../actions';
import { LOCATION_USAGE_LABELS } from '../product-labels';
import { LocationLabelDialog } from './location-label-dialog';
import type { LocationTreeNode } from '@plantero/core';

// Tur 4 P1 bulgusu: her usage kendi hue'sunu taşıyan dolgulu StatusBadge kullanınca sütun tek ekranda
// 4+ farklı renge dönüşüyordu (amber/mavi/kırmızı-dolgusuz/kırmızı-dolgulu/amber/yeşil) — sütun
// gökkuşağa dönüp renk hiçbir anlam ayrımı taşımaz hale geliyordu. Artık TÜM varyantlar nötr dolgulu
// gövde (bg-muted/40 + text-foreground/80) paylaşır; anlam yalnızca 6px'lik renkli noktadadır.
// Dolgulu kırmızı (gerçek "engellenmiş" anlamı) yalnızca 'rejected' için saklanır — o TEK istisna
// StatusBadge'in kendi 'danger' varyantını kullanmaya devam eder.
const USAGE_DOT: Record<string, string> = {
  quarantine: 'bg-warning', production: 'bg-success', supplier: 'bg-muted-foreground/60', customer: 'bg-muted-foreground/60',
  inventory_loss: 'bg-warning', scrap: 'bg-destructive', transit: 'bg-info', view: 'bg-muted-foreground/60',
};

/** Data satırıyla başlık şeridinin tam aynı sütun genişliklerini paylaşması için ortak sabitler. */
const COL = { badge: 'w-24 shrink-0', qty: 'w-32 shrink-0 pr-3 text-right', value: 'w-36 shrink-0 text-right' };

/** "Depo" (internal) = varsayılan kullanım; rozet yalnızca istisnalarda (karantina/red/hurda/…) gösterilir. */
function UsageBadge({ usage }: { usage: string }) {
  if (usage === 'internal') return null;
  const label = LOCATION_USAGE_LABELS[usage] ?? usage;
  if (usage === 'rejected') {
    return <StatusBadge status={usage} label={label} tone="danger" size="sm" />;
  }
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-muted/40 px-2 text-[11px] font-medium whitespace-nowrap text-foreground/80">
      <span aria-hidden className={cn('size-1.5 rounded-full', USAGE_DOT[usage] ?? 'bg-muted-foreground/60')} />
      {label}
    </span>
  );
}

function nodeSearchMatch(node: LocationTreeNode, needle: string): boolean {
  return node.code.toLocaleLowerCase('tr-TR').includes(needle) || node.name.toLocaleLowerCase('tr-TR').includes(needle);
}

/** Arama eşleşmeyen dalları katlar; eşleşen bir yaprağın atalarını (yol bağlamı görünsün diye) tutar. */
function filterTree(nodes: LocationTreeNode[], needle: string): LocationTreeNode[] {
  const out: LocationTreeNode[] = [];
  for (const n of nodes) {
    const children = filterTree(n.children, needle);
    if (nodeSearchMatch(n, needle) || children.length > 0) out.push({ ...n, children });
  }
  return out;
}

function Node({
  node,
  depth,
  warehouseId,
  canManage,
  forceOpen = false,
}: {
  node: LocationTreeNode;
  depth: number;
  warehouseId: string;
  canManage: boolean;
  /** Arama aktifken eşleşen dalları otomatik açık gösterir (kullanıcının kendi aç/kapat tercihini ezmeden). */
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const [addOpen, setAddOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const isOpen = forceOpen || open;
  const usageBadge = <UsageBadge usage={node.usage} />;
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
          <ChevronRight className={cn('size-3.5 transition-transform duration-150 ease-out', isOpen && 'rotate-90')} />
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
          <ChevronRight className={cn('size-3.5 transition-transform duration-150 ease-out', isOpen && 'rotate-90')} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[12px]">{node.code}</span>
            {usageBadge}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">{node.name}</span>
            {/* `num` + `gap-3`: miktar ve değer arasında sabit bir boşluk garanti eder — flex `gap`
                yalnızca kutular arası boşluk bırakır, aralarında görünür bir ayraç yoksa (Tur 3 P1
                bulgusu) iki tabular-nums string yan yana tek sayı gibi okunabiliyordu. Tur 4 P1: başlık
                şeridi 640px altında tamamen gizlendiği için hangi sayının miktar/değer olduğu hâlâ
                belirsizdi — her sayının önüne 10px etiket eklendi (masaüstündeki başlık şeridiyle aynı
                sözcükler: "Mik" / "₺"). */}
            <div className="num flex shrink-0 items-baseline gap-3 text-[12px]">
              <span className="inline-flex items-baseline gap-1">
                <span className="text-[10px] font-normal text-muted-foreground">Mik</span>
                <QtyCell value={node.totalQty} minDigits={2} maxDigits={2} />
              </span>
              <span className="inline-flex items-baseline gap-1">
                <span className="text-[10px] font-normal text-muted-foreground">Değer</span>
                <MoneyCell value={node.totalValue} />
              </span>
            </div>
          </div>
        </div>
      </div>
      {isOpen && hasChildren ? (
        <div>
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} warehouseId={warehouseId} canManage={canManage} forceOpen={forceOpen} />
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
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  // Modüldeki tek liste ekranı arama kutusu olmadan kalmıştı (Tur 3 P1) — burada eklendi. Eşleşmeyen
  // dallar katlanır (filterTree), eşleşen bir yaprağın atası yol bağlamı için görünür kalır.
  const filtered = useMemo(() => (needle ? filterTree(tree, needle) : tree), [tree, needle]);

  return (
    <div>
      {tree.length > 0 ? (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kod ya da ad ara…"
            aria-label="Lokasyon ara"
            className="h-9 w-full rounded-md border border-border/60 bg-background pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-xs"
          />
        </div>
      ) : null}
      {/* Başlık + gövde aynı anatomiyi paylaşır — DataTable ile aynı: kutu yok, yalnızca alttan hairline. */}
      <div className="hidden h-9 w-full items-center gap-2 border-b border-border/60 bg-muted/40 px-2 text-[12px] font-medium text-muted-foreground sm:flex">
        <span className="w-5 shrink-0" />
        <span className="min-w-0 flex-1">Kod / Ad</span>
        <span className={COL.badge}>Durum</span>
        {/* Tur 4 P2: "Miktar (karma birim)" 112px'lik sütuna sarıp iki satırlık başlığın h-9 kapsayıcıya
            dikey nefes bırakmadan sığmasını zorluyordu (sütun 32'ye genişletildi, birim açıklaması title'a taşındı). */}
        <span className={COL.qty} title="Karma birim (farklı UOM'lar birleşik gösterilir)">Miktar</span>
        <span className={COL.value}>Değer</span>
        {/* Etiket + (varsa) ekle simgeleriyle aynı toplam genişlik — satırlarla hizalansın diye */}
        <span className="shrink-0" style={{ width: canManage ? 64 : 28 }} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState compact title="Eşleşen lokasyon yok" description="Aramayı ya da yazımı değiştirmeyi deneyin." />
      ) : (
        <div>
          {filtered.map((n) => (
            <Node key={n.id} node={n} depth={0} warehouseId={warehouseId} canManage={canManage} forceOpen={Boolean(needle)} />
          ))}
        </div>
      )}
    </div>
  );
}

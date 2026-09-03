'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronRight, Plus, Search, Tag, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormText, FormSelect, FormCheckbox } from '@/components/form/fields';
import { FormActions } from '@/components/form/form-actions';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyCell } from '@/components/empty-cell';
import { EmptyState } from '@/components/empty-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { createLocationAction } from '../actions';
import { LOCATION_USAGE_LABELS } from '../product-labels';
import { LocationLabelDialog } from './location-label-dialog';
import type { LocationTreeNode } from '@plantero/core';

// Tur 4 P1 bulgusu: her usage kendi hue'sunu taşıyan dolgulu StatusBadge kullanınca sütun tek ekranda
// 4+ farklı renge dönüşüyordu (amber/mavi/kırmızı-dolgusuz/kırmızı-dolgulu/amber/yeşil) — sütun
// gökkuşağa dönüp renk hiçbir anlam ayrımı taşımaz hale geliyordu. Artık TÜM varyantlar nötr dolgulu
// gövde (bg-muted/40 + text-foreground/80) paylaşır; anlam yalnızca 6px'lik renkli noktadadır.
//
// Tur 11 P1 bulgusu (ana-veri-depolar-04): 'production' burada `bg-success` (yeşil) — yeşil aynı
// zamanda markanın vurgu/birincil eylem rengi (`--primary` ve `--success` `globals.css`'te aynı hue
// 152'yi paylaşır). Depo kullanım tipi bir başarı durumu değil; artık `bg-info` (mavi) kullanır —
// mevcut paletten, success/primary DIŞINDA, `transit` ile aynı hue olsa da (quarantine/inventory_loss
// de zaten aynı amber'ı paylaşıyor, bu modülde önceden de kabul edilmiş bir örüntü) anlam yeşilin tek
// sahibi (başarı/birincil eylem) olmasıyla korunur.
//
// Tur 11 P1 bulgusu (ana-veri-depolar-05): 'rejected' TEK BAŞINA dolgulu `StatusBadge` (bg-destructive/10
// + border) kullanıyordu, sütundaki diğer 8 durum dolgusuz nokta+metin — sütunda iki farklı rozet
// anatomisi. Artık 'rejected' de aynı dolgusuz nokta+metin anatomisini paylaşır (bkz. `UsageBadge`),
// yalnızca nokta VE metin rengi `text-destructive`/`bg-destructive` ile ayrışır — anlam hâlâ net,
// anatomi tek.
const USAGE_DOT: Record<string, string> = {
  quarantine: 'bg-warning', production: 'bg-info', supplier: 'bg-muted-foreground/60', customer: 'bg-muted-foreground/60',
  inventory_loss: 'bg-warning', scrap: 'bg-destructive', transit: 'bg-info', view: 'bg-muted-foreground/60', rejected: 'bg-destructive',
};
const USAGE_TEXT: Record<string, string> = { rejected: 'text-destructive' };

/** Data satırıyla başlık şeridinin tam aynı sütun genişliklerini paylaşması için ortak sabitler. */
// Tur 5 P1: qty 128px → 160px — görünür "Miktar (karma)" etiketi + bilgi ikonu artık tek satıra sığar
// (önceden yalnızca "Miktar" idi, birim uyarısı erişilemez bir `title`'daydı).
const COL = { badge: 'w-24 shrink-0', qty: 'w-40 shrink-0 pr-3 text-right', value: 'w-36 shrink-0 text-right' };

/** "Depo" (internal) = varsayılan kullanım; rozet yalnızca istisnalarda (karantina/red/hurda/…) gösterilir. */
function UsageBadge({ usage }: { usage: string }) {
  if (usage === 'internal') return null;
  const label = LOCATION_USAGE_LABELS[usage] ?? usage;
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-muted/40 px-2 text-[11px] font-medium whitespace-nowrap', USAGE_TEXT[usage] ?? 'text-foreground/80')}>
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
      {/* ≥640px: tek satırlı tam sütunlu görünüm. 390px'te bunun yerine aşağıdaki iki satırlı kart kullanılır.
          `group/row` (isimlendirilmiş): satır aksiyonu butonları bu isimle eşleşir (bkz. aşağıdaki
          `md:group-hover/row:opacity-100` — data-table/row-actions.tsx'teki paylaşılan desenin aynısı,
          Tur 5 P1 bulgusu: burada `group-hover` çıplak kullanılıyordu, klavye/dokunmatikte hiç erişilemiyordu). */}
      <div
        className={cn('group/row hidden h-9 items-center gap-2 rounded-md px-2 hover:bg-accent/50 sm:flex', 'border-b border-border/50 last:border-0')}
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
        {/* Tur 11 P1 bulgusu (ana-veri-depolar-06): Miktar her zaman "0,00" (QtyCell) basıyordu, Değer
            sıfırken EmptyCell "—" — aynı satırda sıfır iki farklı biçimde görünüyordu. Artık ikisi de
            aynı kuralı paylaşır: sıfırsa EmptyCell. */}
        <span className={cn(COL.qty, 'text-[13px]')}>{Number(node.totalQty) === 0 ? <EmptyCell /> : <QtyCell value={node.totalQty} minDigits={2} maxDigits={2} />}</span>
        <span className={cn(COL.value, 'text-[13px]')}>{Number(node.totalValue) === 0 ? <EmptyCell /> : <MoneyCell value={node.totalValue} />}</span>
        {/* Tur 5 P1 bulgusu: `opacity-0 group-hover:opacity-100` yalnızca fare hover'ında görünürdü —
            klavye (Tab) ve dokunmatik ekranlarda bu iki satır eylemi hiç erişilemezdi. Paylaşılan
            data-table/row-actions.tsx:32'deki korumalarla birebir aynı sınıf dizesi (ortak dosya
            değiştirilmedi, burada modül-yerel tekrarlanır — bkz. rapor "sharedComponentRequests"). */}
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 opacity-100 transition-opacity duration-150 data-[state=open]:opacity-100 md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100 md:focus-visible:opacity-100 md:[@media(hover:none)]:opacity-100"
          onClick={() => setLabelOpen(true)}
          title="Etiket yazdır / barkod ata"
        >
          <Tag className="size-3.5" />
        </Button>
        <LocationLabelDialog open={labelOpen} onOpenChange={setLabelOpen} id={node.id} code={node.code} name={node.name} barcode={node.barcode} canManage={canManage} />
        {canManage ? (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 opacity-100 transition-opacity duration-150 data-[state=open]:opacity-100 md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100 md:focus-visible:opacity-100 md:[@media(hover:none)]:opacity-100"
              onClick={() => setAddOpen(true)}
              title="Alt lokasyon ekle"
            >
              <Plus className="size-3.5" />
            </Button>
            <LocationFormDialog warehouseId={warehouseId} parentId={node.id} parentCode={node.code} onDone={() => setAddOpen(false)} />
          </Dialog>
        ) : null}
      </div>
      {/* 390px: iki satırlı kart — satırın tamamı dokunma hedefi (chevron yalnızca görsel gösterge, ≥44px).
          Tur 5 P1 bulgusu: yaprak (alt düğümü olmayan) satırlarda chevron `invisible` ile gizleniyordu
          ama `size-11` düzen alanını KAPLAMAYA devam ediyordu — `paddingLeft`'le (derinlik başına 20px)
          birleşince 2. seviyede ~92px (390px'in ~%24'ü) ölü sol oluk oluşuyordu, "Ambalaj Depo…" gibi
          adlar kırpılıyordu. Chevron artık yaprak satırlarda HİÇ render edilmiyor (yer kaplamıyor);
          kutu size-11→size-7 küçültüldü (görsel gösterge, dokunma hedefi tüm satırdır); kaybolan
          hizalama boşluğu `paddingLeft`'e telafi terimiyle geri eklendi. */}
      <div
        role={hasChildren ? 'button' : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={toggle}
        onKeyDown={hasChildren ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
        className={cn(
          'flex min-h-11 items-center gap-2 border-b border-border/50 px-2 py-1.5 last:border-0 sm:hidden',
          hasChildren && 'cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
        )}
        style={{ paddingLeft: depth * 20 + 8 + (hasChildren ? 0 : 28) }}
      >
        {hasChildren ? (
          <span className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground">
            <ChevronRight className={cn('size-3.5 transition-transform duration-150 ease-out', isOpen && 'rotate-90')} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[12px]">{node.code}</span>
            {usageBadge}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            {/* Tur 11 P1 bulgusu (ana-veri-depolar-04): ad `text-[11px]` idi — mobilde gövde tipografisi
                13px'e hiç ulaşmıyordu (masaüstünde aynı ad 12/13px). Artık 13px, masaüstü gövdesiyle
                aynı kademe.
                Tur 11 P1 bulgusu (ana-veri-depolar-08, "kurumsal-sıkıcı" kokusu): her satırda tekrar eden
                "Miktar"/"Değer" 10px etiket çiftleri (2 depo × 22 satır = 44 etiket) kaldırıldı — sütun
                anlamı artık `LocationTree`'nin gövdenin en üstünde BİR KEZ bastığı mobil ipucunda
                (`MİKTAR · DEĞER`, aşağıda). Satırda yalnızca değerler kalır (Tur 3-10 tarihindeki "Mik"
                kısaltması / grid-cols-2 taşması / glif çakışması denemeleri artık gereksiz — sabit
                genişlikli iki-track ızgara yerine tek satırlık `flex items-baseline` yeterli, kırpılacak
                uzun bir etiket yok).
                Tur 11 P1 bulgusu (ana-veri-depolar-06): Miktar her zaman "0,00" basıyordu, Değer sıfırken
                "—" — aynı satırda sıfır iki farklı biçimde. İkisi de artık aynı kuralı paylaşır. */}
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">{node.name}</span>
            <span className="num flex shrink-0 items-baseline gap-1 text-[13px]">
              {Number(node.totalQty) === 0 ? <EmptyCell /> : <QtyCell value={node.totalQty} minDigits={2} maxDigits={2} />}
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              {Number(node.totalValue) === 0 ? <EmptyCell /> : <MoneyCell value={node.totalValue} />}
            </span>
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
            className="h-11 w-full rounded-md border border-border/60 bg-background pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-xs md:h-9"
          />
        </div>
      ) : null}
      {/* Başlık + gövde aynı anatomiyi paylaşır — DataTable ile aynı: kutu yok, yalnızca alttan hairline. */}
      <div className="hidden h-9 w-full items-center gap-2 border-b border-border/60 bg-muted/40 px-2 text-[12px] font-medium text-muted-foreground sm:flex">
        <span className="w-5 shrink-0" />
        <span className="min-w-0 flex-1">Kod / Ad</span>
        <span className={COL.badge}>Durum</span>
        {/* Tur 4 P2: "Miktar (karma birim)" 112px'lik sütuna sarıp iki satırlık başlığın h-9 kapsayıcıya
            dikey nefes bırakmadan sığmasını zorluyordu — o turda uyarı `title`'a taşındı (sütun 32'ye
            genişletildi). Tur 5 P1 bulgusu: `title` mobilde (dokunma) ve klavyeyle erişilemez, ekran
            okuyucuda güvenilir okunmaz — TIRE/AMB gibi karma birimli satırlarda "24.270,00" hangi
            birimde belirsiz kalıyordu. Gerçek `Tooltip` + görünür `Info` ikonuyla değiştirildi (odak ve
            dokunmayla açılabilir); metin de artık başlıkta "(karma)" ekiyle görünür duruyor. */}
        <span className={cn(COL.qty, 'inline-flex items-center justify-end gap-1')}>
          Miktar (karma)
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none" aria-label="Karma birim açıklaması">
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Karma birim — farklı ölçü birimleri (KG, ADET…) tek toplamda birleşik gösterilir.</TooltipContent>
          </Tooltip>
        </span>
        <span className={COL.value}>Değer</span>
        {/* Etiket + (varsa) ekle simgeleriyle aynı toplam genişlik — satırlarla hizalansın diye */}
        <span className="shrink-0" style={{ width: canManage ? 64 : 28 }} />
      </div>
      {/* Tur 11 P1 bulgusu (ana-veri-depolar-08): mobilde yukarıdaki başlık şeridi tamamen gizlenir
          (`sm:flex`), sütun anlamı önceden HER satırda "Miktar"/"Değer" 10px etiketleriyle tekrarlanıyordu
          (2 depo × 22 satır = 44 etiket). Sütun ipucu artık ağaç başına yalnızca BİR KEZ, sağ üstte —
          satırlarda (bkz. `Node`) çıplak değerler kalır. */}
      {tree.length > 0 ? (
        <div className="mb-1 px-2 text-right text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase sm:hidden">Miktar · Değer</div>
      ) : null}
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

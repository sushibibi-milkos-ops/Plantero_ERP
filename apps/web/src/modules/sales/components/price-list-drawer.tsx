'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from '@/components/ui/drawer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/form/combobox';
import { MoneyCell } from '@/components/money-cell';
import { formatMoney } from '@/lib/format';
import { getPriceListItemsAction, upsertPriceListItemAction, bulkUpdatePriceListAction, type PriceListItemRow } from '../actions';
import type { SellableProductRow } from '../queries';

function EditablePrice({ priceListId, productId, minQty, initial }: { priceListId: string; productId: string; minQty: string; initial: string }) {
  const [value, setValue] = useState(formatMoney(initial, 'TRY', { digits: 2 }).replace(/[^\d,.-]/g, ''));
  const [pending, startTransition] = useTransition();

  function save() {
    const price = value.replace(/\./g, '').replace(',', '.');
    if (!price || Number.isNaN(Number(price))) return;
    startTransition(async () => {
      const res = await upsertPriceListItemAction({ priceListId, productId, minQty, price });
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      disabled={pending}
      className="h-8 w-28 text-right font-mono text-[13px] tabular-nums"
    />
  );
}

export function PriceListDrawer({
  listId,
  listName,
  currency,
  itemCount,
  products,
  open: openProp,
  onOpenChange,
}: {
  listId: string;
  listName: string;
  currency: string;
  itemCount: number;
  products: SellableProductRow[];
  /** Dıştan kontrol (ör. satır tıklaması tabloda) — verilmezse kendi tetikleyici düğmesini çizer. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const controlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [items, setItems] = useState<PriceListItemRow[] | null>(null);
  const [bulkPct, setBulkPct] = useState('');
  const [addProductId, setAddProductId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    getPriceListItemsAction({ priceListId: listId }).then((res) => setItems(res.ok ? res.data : []));
  }

  useEffect(() => {
    if (!open) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listId]);

  const productOptions = products.filter((p) => !items?.some((it) => it.item.productId === p.id)).map((p) => ({ value: p.id, label: p.name, description: p.sku }));

  function applyBulk() {
    if (!bulkPct) return;
    startTransition(async () => {
      const res = await bulkUpdatePriceListAction({ priceListId: listId, pct: bulkPct });
      if (res.ok) {
        toast.success(`${res.data.updated} satır güncellendi`);
        setBulkPct('');
        reload();
      } else {
        toast.error(res.error);
      }
    });
  }

  function addProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    startTransition(async () => {
      const res = await upsertPriceListItemAction({ priceListId: listId, productId, minQty: '0', price: product.listPrice || '0' });
      if (res.ok) {
        setAddProductId(null);
        reload();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      {controlled ? null : (
        <DrawerTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            Satırlar ({itemCount})
          </Button>
        </DrawerTrigger>
      )}
      <DrawerContent className="w-full sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{listName}</DrawerTitle>
          <DrawerDescription>Ürün başına min. miktar ve fiyat ({currency}). Hücreye tıklayıp değiştirin, odak kaybında kaydedilir.</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Percent className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} placeholder="Toplu artış % (ör. 5 ya da -3)" className="h-8 pl-8 text-[13px]" />
            </div>
            <Button size="sm" variant="outline" className="h-8" onClick={applyBulk} disabled={pending || !bulkPct}>
              Uygula
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox value={addProductId} onChange={(v) => { setAddProductId(v); if (v) addProduct(v); }} options={productOptions} placeholder="Ürün ekle…" />
            </div>
            <Plus className="size-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="overflow-hidden rounded-lg border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Min. miktar</TableHead>
                  <TableHead className="text-right">Fiyat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items === null ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">Yükleniyor…</TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">Henüz satır yok</TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow key={it.item.id}>
                      <TableCell>
                        <div className="font-medium">{it.productName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{it.sku}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{it.item.minQty}</TableCell>
                      <TableCell className="text-right">
                        <EditablePrice priceListId={listId} productId={it.item.productId} minQty={it.item.minQty} initial={it.item.price} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function PriceCellStatic({ value, currency }: { value: string; currency: string }) {
  return <MoneyCell value={value} currency={currency} />;
}

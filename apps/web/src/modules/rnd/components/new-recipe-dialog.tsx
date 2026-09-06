'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Combobox } from '@/components/form/combobox';
import { createTrialRecipeAction } from '../actions';
import type { ProductOption } from '../queries';

export function NewRecipeDialog({ projectId, productOptions }: { projectId: string; productOptions: ProductOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState('1');
  const [pending, setPending] = useState(false);

  const productById = new Map(productOptions.map((p) => [p.id, p]));
  const options = productOptions.map((p) => ({ value: p.id, label: p.name, description: p.sku, keywords: [p.sku] }));

  async function submit() {
    const product = productId ? productById.get(productId) : null;
    if (!name.trim() || !product || !qty.trim()) return;
    setPending(true);
    const res = await createTrialRecipeAction({
      projectId, name: name.trim(), batchQty: '1',
      lines: [{ productId: product.id, qty, uomId: product.uomId, costSource: 'average', scrapPct: '0' }],
    });
    setPending(false);
    if (res.ok) {
      setOpen(false);
      setName('');
      setProductId(null);
      toast.success('Deneme reçetesi oluşturuldu — satırları düzenleyin');
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" /> Yeni deneme reçetesi</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Yeni deneme reçetesi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="recipe-name">Ad</Label>
            <Input id="recipe-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Fıstık Bazı v1" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>İlk satır — ürün</Label>
            <Combobox value={productId} onChange={setProductId} options={options} placeholder="Ürün ara…" clearable={false} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipe-qty">Miktar</Label>
            <Input id="recipe-qty" value={qty} onChange={(e) => setQty(e.target.value)} className="tabular-nums" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending || !name.trim() || !productId}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

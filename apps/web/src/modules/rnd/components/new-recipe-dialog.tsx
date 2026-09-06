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
import { cn } from '@/lib/utils';
import { createTrialRecipeAction } from '../actions';
import type { ProductOption } from '../queries';

export function NewRecipeDialog({
  projectId, productOptions, triggerClassName, compact,
}: {
  projectId: string;
  productOptions: ProductOption[];
  /** Varsayılan tetikleyici (`h-11 w-full md:h-8 md:w-auto`) üzerine ek/geçersiz kılan sınıflar —
   *  mobil kompakt araç çubuğunda (recipe-workspace.tsx) içerik genişliğinde, tam genişlik DEĞİL. */
  triggerClassName?: string;
  /** Yalnızca ikon (metin `sr-only`) — mobil tek satırlık araç çubuğunda yer kazanır (Tur 4 P1
   *  arge-recete-18): 44×44 dokunma hedefi korunur, görünür metin yok. */
  compact?: boolean;
}) {
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
        {/* h-11 md:h-8: 390px'te gerçek 44px dokunma hedefi (kriter 9) — sidebar'daki diğer
            butonlarla (recipe-workspace.tsx "Yeni versiyon") aynı desen. */}
        <Button size={compact ? 'icon' : 'sm'} aria-label={compact ? 'Yeni deneme reçetesi' : undefined} className={cn('h-11 w-full md:h-8 md:w-auto', compact && 'size-11 w-11', triggerClassName)}>
          <Plus className="size-4" /> <span className={cn(compact && 'sr-only')}>Yeni deneme reçetesi</span>
        </Button>
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

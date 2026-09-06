'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createProjectAction } from '../actions';
import { DEFAULT_COLUMNS } from '../labels';
import type { ProductOption } from '../queries';

export function NewProjectDialog({ productOptions }: { productOptions: ProductOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [productId, setProductId] = useState<string>('none');
  const [targetSku, setTargetSku] = useState('');
  const [targetUnitCost, setTargetUnitCost] = useState('');
  const [columns, setColumns] = useState<string[]>([...DEFAULT_COLUMNS]);
  const [pending, setPending] = useState(false);

  function updateColumn(i: number, value: string) {
    setColumns((cur) => cur.map((c, idx) => (idx === i ? value : c)));
  }
  function removeColumn(i: number) {
    setColumns((cur) => cur.filter((_, idx) => idx !== i));
  }
  function addColumn() {
    setColumns((cur) => [...cur, '']);
  }

  async function submit() {
    if (!name.trim()) return;
    const cleanColumns = columns.map((c) => c.trim()).filter(Boolean);
    if (cleanColumns.length === 0) { toast.error('En az bir kolon gerekli'); return; }
    setPending(true);
    const res = await createProjectAction({
      name: name.trim(),
      goal: goal.trim() || null,
      productId: productId === 'none' ? null : productId,
      targetSku: targetSku.trim() || null,
      targetUnitCost: targetUnitCost.trim() || null,
      columns: cleanColumns.map((n) => ({ name: n })),
    });
    setPending(false);
    if (res.ok) {
      setOpen(false);
      toast.success(`Proje oluşturuldu: ${res.data.code}`);
      router.push(`/arge/projeler/${res.data.id}/board`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> Yeni proje</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Yeni Ar-Ge projesi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Proje adı</Label>
            <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Fıstık Bazı" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-goal">Hedef</Label>
            <Textarea id="proj-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="Bu projenin amacı…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ürün (varsa)</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Yeni SKU adayı</SelectItem>
                  {productOptions.map((p) => (<SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-sku">Hedef SKU (metin)</Label>
              <Input id="proj-sku" value={targetSku} onChange={(e) => setTargetSku(e.target.value)} placeholder="110050001" disabled={productId !== 'none'} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-cost">Hedef birim maliyet (₺)</Label>
            <Input id="proj-cost" value={targetUnitCost} onChange={(e) => setTargetUnitCost(e.target.value)} placeholder="ör. 42.50" />
          </div>
          <div className="space-y-1.5">
            <Label>Board kolonları</Label>
            <div className="space-y-1.5">
              {columns.map((c, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input value={c} onChange={(e) => updateColumn(i, e.target.value)} className="h-8 text-[13px]" />
                  <Button size="icon-sm" variant="ghost" onClick={() => removeColumn(i)} aria-label="Kaldır"><X className="size-3.5" /></Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={addColumn}><Plus className="size-3.5" /> Kolon ekle</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

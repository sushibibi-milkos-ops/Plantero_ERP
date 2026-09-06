'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createRoleAction } from '../actions';

/** Rol kodu: küçük harf, rakam, alt çizgi — `packages/core/src/settings/roles.ts::ROLE_CODE_PATTERN` ile aynı */
function normalizeCode(v: string): string {
  return v
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 40);
}

export function NewRoleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function reset() {
    setName('');
    setCode('');
    setCodeTouched(false);
    setDescription('');
  }

  async function submit() {
    if (!name.trim()) { toast.error('Rol adı gerekli'); return; }
    if (!code.trim()) { toast.error('Rol kodu gerekli'); return; }
    setPending(true);
    const res = await createRoleAction({ code, name, description: description || undefined });
    setPending(false);
    if (res.ok) {
      toast.success(res.message ?? 'Rol oluşturuldu');
      setOpen(false);
      reset();
      router.push(`/ayarlar/roller?role=${res.data.id}`);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button disabled={!mounted}><Plus className="size-4" /> Yeni Rol</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni rol oluştur</DialogTitle>
          <DialogDescription>Oluşturduktan sonra izin matrisinden yetkilerini seçin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-role-name">Rol adı</Label>
            <Input
              id="new-role-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!codeTouched) setCode(normalizeCode(e.target.value));
              }}
              placeholder="ör. Vardiya Amiri"
              className="h-11 md:h-9"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-role-code">Rol kodu</Label>
            <Input
              id="new-role-code"
              value={code}
              onChange={(e) => { setCode(normalizeCode(e.target.value)); setCodeTouched(true); }}
              placeholder="ör. vardiya_amiri"
              className="h-11 font-mono text-[13px] md:h-9"
            />
            <p className="text-[12px] text-muted-foreground">Küçük harf, rakam ve alt çizgi; RBAC izin sisteminde benzersiz kimlik olarak kullanılır.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-role-desc">Açıklama (opsiyonel)</Label>
            <Textarea id="new-role-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-[13px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createColumnAction } from '../actions';

export function NewColumnInline({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setPending(true);
    const res = await createColumnAction({ projectId, name: name.trim() });
    setPending(false);
    if (res.ok) {
      setName('');
      setEditing(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  if (!editing) {
    return (
      <Button type="button" variant="ghost" className="h-10 w-64 shrink-0 justify-start border border-dashed border-border/60 text-muted-foreground" onClick={() => setEditing(true)}>
        <Plus className="size-4" /> Kolon ekle
      </Button>
    );
  }

  return (
    <div className="w-64 shrink-0 space-y-2 rounded-xl border border-border/60 bg-muted/30 p-2.5">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Kolon adı…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <div className="flex gap-1.5">
        <Button size="sm" onClick={submit} disabled={pending || !name.trim()}>Ekle</Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Vazgeç"><X className="size-3.5" /></Button>
      </div>
    </div>
  );
}

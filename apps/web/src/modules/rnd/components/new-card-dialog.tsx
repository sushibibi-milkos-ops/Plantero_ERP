'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createCardAction } from '../actions';
import type { BoardColumnRow } from '../queries';

export function NewCardDialog({
  projectId, columns, open, onOpenChange, defaultColumnId,
}: {
  projectId: string;
  columns: BoardColumnRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultColumnId: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [columnId, setColumnId] = useState(defaultColumnId ?? columns[0]?.id ?? '');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setColumnId(defaultColumnId ?? columns[0]?.id ?? '');
    }
  }, [open, defaultColumnId, columns]);

  async function submit() {
    if (!title.trim() || !columnId) return;
    setPending(true);
    const res = await createCardAction({ projectId, columnId, title: title.trim() });
    setPending(false);
    if (res.ok) {
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Yeni kart</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-card-title">Başlık</Label>
            <Input
              id="new-card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kart başlığı…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kolon</Label>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {columns.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending || !title.trim()}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

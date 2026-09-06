'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Gauge, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { renameColumnAction, setColumnWipLimitAction, setColumnDoneAction, deleteColumnAction } from '../actions';
import type { BoardColumnRow } from '../queries';

export function ColumnMenu({ column, projectId }: { column: BoardColumnRow; projectId: string }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [wipOpen, setWipOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(column.name);
  const [wip, setWip] = useState(column.wipLimit ? String(column.wipLimit) : '');
  const [pending, setPending] = useState(false);

  async function submitRename() {
    if (!name.trim()) return;
    setPending(true);
    const res = await renameColumnAction({ id: column.id, projectId, name: name.trim() });
    setPending(false);
    if (res.ok) { setRenameOpen(false); router.refresh(); } else toast.error(res.error);
  }

  async function submitWip() {
    setPending(true);
    const parsed = wip.trim() ? Number(wip) : null;
    const res = await setColumnWipLimitAction({ id: column.id, projectId, wipLimit: parsed });
    setPending(false);
    if (res.ok) { setWipOpen(false); router.refresh(); } else toast.error(res.error);
  }

  async function toggleDone() {
    const res = await setColumnDoneAction({ id: column.id, projectId, isDone: !column.isDone });
    if (res.ok) { toast.success(column.isDone ? 'Tamamlandı işareti kaldırıldı' : '"Tamamlandı" kolonu olarak işaretlendi'); router.refresh(); }
    else toast.error(res.error);
  }

  async function confirmDelete() {
    const res = await deleteColumnAction({ id: column.id, projectId });
    if (res.ok) { toast.success('Kolon silindi'); router.refresh(); return { ok: true }; }
    return { ok: false, error: res.error };
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label="Kolon menüsü">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}><Pencil className="size-3.5" /> Yeniden adlandır</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setWipOpen(true)}><Gauge className="size-3.5" /> WIP limiti</DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleDone}><CheckCircle2 className="size-3.5" /> {column.isDone ? '"Tamamlandı" işaretini kaldır' : '"Tamamlandı" olarak işaretle'}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}><Trash2 className="size-3.5" /> Kolonu sil</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Kolonu yeniden adlandır</DialogTitle></DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus onKeyDown={(e) => e.key === 'Enter' && submitRename()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Vazgeç</Button>
            <Button onClick={submitRename} disabled={pending || !name.trim()}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wipOpen} onOpenChange={setWipOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>WIP limiti — {column.name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="wip-input">En fazla kart sayısı (boş = sınırsız)</Label>
            <Input id="wip-input" type="number" min={1} value={wip} onChange={(e) => setWip(e.target.value)} placeholder="Sınırsız" onKeyDown={(e) => e.key === 'Enter' && submitWip()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWipOpen(false)}>Vazgeç</Button>
            <Button onClick={submitWip} disabled={pending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Kolonu sil"
        description={`"${column.name}" kolonu silinecek. Kolonda kart varsa işlem reddedilir.`}
        confirmLabel="Sil"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}

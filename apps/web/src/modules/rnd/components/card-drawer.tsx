'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Paperclip, Trash2, Plus, Loader2, FlaskConical, X, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  getCardDetailAction, updateCardAction, updateChecklistAction, addCommentAction, addAttachmentAction,
  linkTrialVersionAction, setCardArchivedAction,
} from '../actions';
import type { CardDetail } from '../queries';

const MAX_ATTACHMENT_BYTES = 3_500_000;

export function CardDrawer({
  cardId, projectId, onClose, userOptions, recipeVersionOptions,
}: {
  cardId: string | null;
  projectId: string;
  onClose: () => void;
  userOptions: Array<{ id: string; fullName: string }>;
  recipeVersionOptions: Array<{ id: string; label: string }>;
  }) {
  const router = useRouter();
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [description, setDescription] = useState('');
  const [checklist, setChecklist] = useState<Array<{ text: string; done: boolean }>>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cardId) { setDetail(null); return; }
    getCardDetailAction({ id: cardId }).then((res) => {
      if (res.ok) {
        setDetail(res.data);
        setDescription(res.data.card.description ?? '');
        setChecklist((res.data.card.checklist as Array<{ text: string; done: boolean }>) ?? []);
      } else {
        setDetail(null);
        toast.error(res.error);
      }
    });
  }, [cardId]);

  async function refresh() {
    if (!cardId) return;
    const res = await getCardDetailAction({ id: cardId });
    if (res.ok) setDetail(res.data);
  }

  async function saveDescription() {
    if (!cardId) return;
    const res = await updateCardAction({ id: cardId, projectId, description });
    if (res.ok) { toast.success('Açıklama kaydedildi'); router.refresh(); } else toast.error(res.error);
  }

  async function saveAssignee(assigneeId: string | null) {
    if (!cardId) return;
    const res = await updateCardAction({ id: cardId, projectId, assigneeId });
    if (res.ok) router.refresh(); else toast.error(res.error);
  }

  async function saveDueDate(dueDate: string | null) {
    if (!cardId) return;
    const res = await updateCardAction({ id: cardId, projectId, dueDate });
    if (res.ok) router.refresh(); else toast.error(res.error);
  }

  async function persistChecklist(next: Array<{ text: string; done: boolean }>) {
    setChecklist(next);
    if (!cardId) return;
    const res = await updateChecklistAction({ id: cardId, projectId, checklist: next });
    if (res.ok) router.refresh(); else toast.error(res.error);
  }

  function toggleChecklistItem(index: number) {
    const next = checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it));
    void persistChecklist(next);
  }

  function removeChecklistItem(index: number) {
    void persistChecklist(checklist.filter((_, i) => i !== index));
  }

  function addChecklistItem() {
    if (!newChecklistItem.trim()) return;
    void persistChecklist([...checklist, { text: newChecklistItem.trim(), done: false }]);
    setNewChecklistItem('');
  }

  async function submitComment() {
    if (!cardId || !comment.trim()) return;
    setPending(true);
    const res = await addCommentAction({ cardId, projectId, body: comment.trim() });
    setPending(false);
    if (res.ok) { setComment(''); void refresh(); router.refresh(); } else toast.error(res.error);
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !cardId) return;
    if (file.size > MAX_ATTACHMENT_BYTES) { toast.error('Dosya çok büyük (üst sınır ~2.5MB)'); return; }
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setPending(true);
    const res = await addAttachmentAction({ cardId, projectId, fileName: file.name, mimeType: file.type || 'application/octet-stream', dataUrl });
    setPending(false);
    if (res.ok) { void refresh(); router.refresh(); } else toast.error(res.error);
  }

  async function linkVersion(versionId: string | null) {
    if (!cardId) return;
    const res = await linkTrialVersionAction({ cardId, projectId, trialVersionId: versionId });
    if (res.ok) { void refresh(); router.refresh(); } else toast.error(res.error);
  }

  async function archive() {
    if (!cardId) return;
    const res = await setCardArchivedAction({ id: cardId, projectId, isArchived: true });
    if (res.ok) { toast.success('Kart arşivlendi'); onClose(); router.refresh(); } else toast.error(res.error);
  }

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <Sheet open={Boolean(cardId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {detail ? (
          <>
            <SheetHeader className="border-b border-border/60">
              <SheetTitle className="text-base">{detail.card.title}</SheetTitle>
              <SheetDescription>Ar-Ge kartı — {detail.card.isArchived ? 'arşivlenmiş' : 'aktif'}</SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-4">
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="space-y-1">
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><User className="size-3" /> Atanan</label>
                  <Select value={detail.card.assigneeId ?? 'none'} onValueChange={(v) => saveAssignee(v === 'none' ? null : v)}>
                    <SelectTrigger className="h-8 w-full text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Atanmadı</SelectItem>
                      {userOptions.map((u) => (<SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><Calendar className="size-3" /> Son tarih</label>
                  <Input type="date" className="h-8 text-[13px]" value={detail.card.dueDate ?? ''} onChange={(e) => saveDueDate(e.target.value || null)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><FlaskConical className="size-3" /> Bağlı deneme reçetesi</label>
                <Select value={detail.card.trialVersionId ?? 'none'} onValueChange={(v) => linkVersion(v === 'none' ? null : v)}>
                  <SelectTrigger className="h-8 w-full text-[13px]"><SelectValue placeholder="Bağlantı yok" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Bağlantı yok</SelectItem>
                    {recipeVersionOptions.map((v) => (<SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground">Açıklama</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveDescription} rows={3} className="text-[13px]" placeholder="Açıklama ekleyin…" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-muted-foreground">Kontrol listesi {checklist.length > 0 ? `(${doneCount}/${checklist.length})` : ''}</label>
                </div>
                {checklist.length > 0 ? (
                  <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-success transition-[width] duration-200 ease-out" style={{ width: `${checklist.length ? (doneCount / checklist.length) * 100 : 0}%` }} />
                  </div>
                ) : null}
                <div className="space-y-1">
                  {checklist.map((item, i) => (
                    <div key={i} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                      <Checkbox checked={item.done} onCheckedChange={() => toggleChecklistItem(i)} className="size-4" />
                      <span className={cn('flex-1 text-[13px]', item.done && 'text-muted-foreground line-through')}>{item.text}</span>
                      <button type="button" onClick={() => removeChecklistItem(i)} className="text-muted-foreground opacity-0 group-hover:opacity-100" aria-label="Sil"><X className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()} placeholder="Adım ekle…" className="h-8 text-[13px]" />
                  <Button size="icon-sm" variant="outline" onClick={addChecklistItem} disabled={!newChecklistItem.trim()} aria-label="Ekle"><Plus className="size-3.5" /></Button>
                </div>
              </div>

              <div className="border-t border-border/60 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[13px] font-medium text-muted-foreground">Yorumlar ve ekler</h3>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={pending}>
                    <Paperclip className="size-3.5" /> Ek ekle
                  </Button>
                </div>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Yorum yazın…" rows={2} className="text-[13px]" />
                <Button size="sm" variant="secondary" className="mt-2" onClick={submitComment} disabled={pending || !comment.trim()}>
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ekle
                </Button>

                <div className="mt-3 space-y-3">
                  {detail.activity.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Henüz aktivite yok.</p>
                  ) : (
                    detail.activity.map((a) => (
                      <div key={a.id} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                          {(a.userName ?? 'S').slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          {a.kind === 'comment' ? (
                            <p className="text-[13px] whitespace-pre-wrap">{a.body}</p>
                          ) : (
                            <a href={a.dataUrl} download={a.fileName} className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[12px] hover:bg-muted">
                              <Paperclip className="size-3" /> {a.fileName}
                            </a>
                          )}
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{a.userName ?? 'Sistem'} · {relativeTime(a.createdAt)} · {formatDateTime(a.createdAt)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-border/60 pt-3">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={archive}>
                  <Trash2 className="size-3.5" /> Kartı arşivle
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Yükleniyor…</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Phone, Mail, Users, StickyNote, MessageCircle, Send, ArrowRightCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDateTime, relativeTime } from '@/lib/format';
import { getOpportunityDetailAction, addActivityAction, convertToQuotationAction, type OpportunityDetailData } from '../actions';
import { ACTIVITY_KIND_LABELS } from '../labels';

const KIND_ICON = { call: Phone, email: Mail, meeting: Users, note: StickyNote, whatsapp: MessageCircle } as const;

export function OpportunityDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<OpportunityDetailData | null>(null);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<keyof typeof KIND_ICON>('note');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    getOpportunityDetailAction({ id }).then((res) => setDetail(res.ok ? res.data : null));
  }, [id]);

  function addNote() {
    if (!id || !note.trim()) return;
    startTransition(async () => {
      const res = await addActivityAction({ opportunityId: id, kind, body: note.trim() });
      if (res.ok) {
        setNote('');
        const refreshed = await getOpportunityDetailAction({ id });
        if (refreshed.ok) setDetail(refreshed.data);
      } else {
        toast.error(res.error);
      }
    });
  }

  function convert() {
    if (!id) return;
    startTransition(async () => {
      const res = await convertToQuotationAction({ id });
      if (res.ok) {
        toast.success(`Teklife dönüştürüldü: ${res.data.quotationDocNo}`);
        router.push(`/satis/teklifler/${res.data.quotationId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        {detail ? (
          <>
            <SheetHeader className="border-b border-border/60">
              <SheetTitle className="font-mono text-sm">{detail.opportunity.docNo}</SheetTitle>
              <SheetDescription>{detail.opportunity.title}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <MoneyCell value={detail.opportunity.expectedAmount} currency={detail.opportunity.currency} className="text-lg font-semibold text-foreground" />
                <span className="text-xs text-muted-foreground">· %{detail.opportunity.probability} olasılık</span>
              </div>
              <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
                <dt className="text-muted-foreground">Cari</dt><dd className="text-right">{detail.partnerName ?? '—'}</dd>
                <dt className="text-muted-foreground">Kanal</dt><dd className="text-right">{detail.channelName ?? '—'}</dd>
                <dt className="text-muted-foreground">Sahibi</dt><dd className="text-right">{detail.ownerName ?? '—'}</dd>
                <dt className="text-muted-foreground">Kaynak</dt><dd className="text-right">{detail.opportunity.source ?? '—'}</dd>
                {detail.opportunity.contactName ? (<><dt className="text-muted-foreground">İletişim</dt><dd className="text-right">{detail.opportunity.contactName}</dd></>) : null}
              </dl>

              {detail.opportunity.quotationId ? (
                <StatusBadge status="converted" label={`Teklif: ${detail.quotationDocNo}`} tone="success" />
              ) : (
                <Button size="sm" onClick={convert} disabled={pending} className="w-full">
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightCircle className="size-3.5" />} Teklife dönüştür
                </Button>
              )}

              <div className="border-t border-border/60 pt-3">
                <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">Aktivite ekle</h3>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {(Object.keys(KIND_ICON) as Array<keyof typeof KIND_ICON>).map((k) => {
                    const Icon = KIND_ICON[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] ${kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:bg-accent'}`}
                      >
                        <Icon className="size-3" /> {ACTIVITY_KIND_LABELS[k]}
                      </button>
                    );
                  })}
                </div>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not yazın…" rows={2} className="text-[13px]" />
                <Button size="sm" variant="outline" className="mt-2" onClick={addNote} disabled={pending || !note.trim()}>
                  <Send className="size-3.5" /> Ekle
                </Button>
              </div>

              <div className="space-y-3">
                {detail.activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Henüz aktivite yok.</p>
                ) : (
                  detail.activities.map((a) => {
                    const Icon = KIND_ICON[a.a.kind as keyof typeof KIND_ICON] ?? StickyNote;
                    return (
                      <div key={a.a.id} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                          <Icon className="size-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] whitespace-pre-wrap">{a.a.body}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{a.userName ?? 'Sistem'} · {relativeTime(a.a.at)} · {formatDateTime(a.a.at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
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

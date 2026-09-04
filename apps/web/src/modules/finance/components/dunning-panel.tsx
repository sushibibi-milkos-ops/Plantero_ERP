'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Sparkles, Send, Eye, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/status-badge';
import { formatMoney, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { createDunningDraftAction, approveAndSendDunningAction } from '../dunning-actions';
import type { DueInvoiceDto } from '../dunning-queries';

const LEVEL_LABEL: Record<number, string> = { 1: 'Nazik hatırlatma', 2: 'Vade geçti', 3: 'Sert hatırlatma', 4: 'İhtar' };
const LEVEL_TONE: Record<number, 'neutral' | 'info' | 'warning' | 'danger'> = { 1: 'neutral', 2: 'info', 3: 'warning', 4: 'danger' };
const SENDABLE_STATUS = new Set(['draft', 'pending_approval', 'approved']);

type DraftSeed = { id: string; docNo: string; partnerName: string; channel: string; subject: string | null; body: string };

/**
 * Ortak "taslağı düzenle → onayla ve gönder" diyaloğu. `generate` verilirse (yeni taslak akışı,
 * /finans/tahsilat-takibi tablosundaki "Taslak oluştur") önce AI (yoksa şablon) taslağını üretir;
 * verilmezse (mevcut bir taslağı incelemek — "İncele ve gönder") doğrudan `seed`'deki metinle açılır.
 */
function SendDialog({ seed, generate, onClose }: { seed: DraftSeed | null; generate?: () => Promise<{ ok: true; data: DraftSeed } | { ok: false; error: string }>; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<'generating' | 'edit' | 'sending'>(seed ? 'edit' : 'generating');
  const [current, setCurrent] = useState<DraftSeed | null>(seed);
  const [subject, setSubject] = useState(seed?.subject ?? '');
  const [body, setBody] = useState(seed?.body ?? '');
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (seed || !generate) return;
    startTransition(async () => {
      const res = await generate();
      if (res.ok) {
        setCurrent(res.data);
        setSubject(res.data.subject ?? '');
        setBody(res.data.body);
        setStep('edit');
      } else {
        toast.error(res.error);
        onClose();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca ilk açılışta bir kez üretir (bkz. üstteki not)
  }, []);

  if (!current && step === 'generating') {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />Hatırlatma taslağı</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Taslak üretiliyor…
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!current) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {current.docNo} — hatırlatma taslağı
          </DialogTitle>
          <DialogDescription>{current.partnerName} · {current.channel === 'email' ? 'E-posta' : 'WhatsApp'} · metni düzenleyip onaylayın.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {current.channel === 'email' ? (
            <div className="space-y-1.5">
              <Label htmlFor="subject">Konu</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="body">Metin</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="font-mono text-[13px]" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={step === 'sending'}>Vazgeç</Button>
          <Button
            disabled={step !== 'edit'}
            onClick={() => {
              setStep('sending');
              startTransition(async () => {
                const res = await approveAndSendDunningAction({ dunningActionId: current.id, subject, body });
                if (res.ok) {
                  toast.success(`Gönderildi${res.data.sandbox ? ' (sandbox)' : ''}`);
                  onClose();
                  router.refresh();
                } else {
                  toast.error(res.error);
                  setStep('edit');
                }
              });
            }}
          >
            {step === 'sending' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Onayla ve gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type DunningActionSummary = { id: string; invoiceId: string; level: number; channel: string; status: string; subject: string | null; body: string };

export function DunningTable({ due, actions }: { due: DueInvoiceDto[]; actions: DunningActionSummary[] }) {
  const [creatingFor, setCreatingFor] = useState<DueInvoiceDto | null>(null);
  const [reviewing, setReviewing] = useState<DraftSeed | null>(null);

  const findExisting = (invoiceId: string, level: number) => actions.find((a) => a.invoiceId === invoiceId && a.level === level);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
            <th className="px-3 py-2 font-medium">Müşteri</th>
            <th className="px-3 py-2 font-medium">Fatura</th>
            <th className="px-3 py-2 font-medium">Vade</th>
            <th className="px-3 py-2 text-right font-medium">Gecikme</th>
            <th className="px-3 py-2 text-right font-medium">Bakiye</th>
            <th className="px-3 py-2 font-medium">Seviye</th>
            <th className="px-3 py-2 font-medium">Son hatırlatma</th>
            <th className="px-3 py-2 text-right font-medium">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {due.map((r) => {
            const existing = r.hasDraft ? findExisting(r.id, r.level) : undefined;
            return (
              <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">{r.partnerName}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.docNo}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(r.dueDate)}</td>
                <td className={cn('px-3 py-2 text-right font-mono tabular-nums', r.daysOverdue > 30 && 'text-destructive')}>{r.daysOverdue} gün</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatMoney(r.residual, r.currency, { digits: 2 })}</td>
                <td className="px-3 py-2"><StatusBadge status={String(r.level)} label={LEVEL_LABEL[r.level]} tone={LEVEL_TONE[r.level]} /></td>
                <td className="px-3 py-2 text-muted-foreground">{r.lastDunningAt ? formatDate(r.lastDunningAt) : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {existing && SENDABLE_STATUS.has(existing.status) ? (
                    <Button size="sm" variant="outline" onClick={() => setReviewing({ id: existing.id, docNo: r.docNo, partnerName: r.partnerName, channel: existing.channel, subject: existing.subject, body: existing.body })}>
                      <Eye className="size-3.5" /> İncele ve gönder
                    </Button>
                  ) : existing ? (
                    <span className="text-xs text-muted-foreground">Gönderildi</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setCreatingFor(r)}>
                      <Sparkles className="size-3.5" /> Taslak oluştur
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
          {due.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Vadesi geçmiş fatura yok.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {creatingFor ? (
        <SendDialog
          seed={null}
          generate={async () => {
            const res = await createDunningDraftAction({ invoiceId: creatingFor.id });
            if (!res.ok) return res;
            return { ok: true, data: { id: res.data.id, docNo: creatingFor.docNo, partnerName: creatingFor.partnerName, channel: res.data.channel, subject: res.data.subject, body: res.data.body } };
          }}
          onClose={() => setCreatingFor(null)}
        />
      ) : null}
      {reviewing ? <SendDialog seed={reviewing} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

const CHANNEL_ICON: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageCircle };

export type DunningHistoryRow = { id: string; invoiceDocNo: string; partnerName: string; level: number; channel: string; status: string; subject: string | null; body: string; sentAt: Date | null; sentTo: string | null };

export function DunningHistoryList({ actions }: { actions: DunningHistoryRow[] }) {
  const [reviewing, setReviewing] = useState<DraftSeed | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
            <th className="px-3 py-2 font-medium">Fatura</th>
            <th className="px-3 py-2 font-medium">Müşteri</th>
            <th className="px-3 py-2 font-medium">Seviye</th>
            <th className="px-3 py-2 font-medium">Kanal</th>
            <th className="px-3 py-2 font-medium">Durum</th>
            <th className="px-3 py-2 font-medium">Gönderildi</th>
            <th className="px-3 py-2 text-right font-medium">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => {
            const Icon = CHANNEL_ICON[a.channel] ?? Mail;
            return (
              <tr key={a.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{a.invoiceDocNo}</td>
                <td className="px-3 py-2">{a.partnerName}</td>
                <td className="px-3 py-2">{LEVEL_LABEL[a.level] ?? a.level}</td>
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Icon className="size-3.5" />{a.channel === 'email' ? 'E-posta' : 'WhatsApp'}</span></td>
                <td className="px-3 py-2">
                  <StatusBadge
                    status={a.status}
                    label={a.status === 'sent' ? 'Gönderildi' : a.status === 'failed' ? 'Başarısız' : a.status === 'pending_approval' ? 'Onay bekliyor' : a.status === 'approved' ? 'Onaylandı' : 'Taslak'}
                    tone={a.status === 'sent' ? 'success' : a.status === 'failed' ? 'danger' : a.status === 'pending_approval' ? 'warning' : 'neutral'}
                  />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{a.sentAt ? formatDate(a.sentAt) : '—'}{a.sentTo ? ` · ${a.sentTo}` : ''}</td>
                <td className="px-3 py-2 text-right">
                  {SENDABLE_STATUS.has(a.status) ? (
                    <Button size="sm" variant="outline" onClick={() => setReviewing({ id: a.id, docNo: a.invoiceDocNo, partnerName: a.partnerName, channel: a.channel, subject: a.subject, body: a.body })}>
                      <Eye className="size-3.5" /> İncele ve gönder
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {actions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">Henüz hatırlatma geçmişi yok.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {reviewing ? <SendDialog seed={reviewing} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

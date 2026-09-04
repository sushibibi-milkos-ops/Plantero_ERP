'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Sparkles, Send, Eye, Mail, MessageCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
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

  // Kriter 7 + 5 kök neden düzeltmesi (Tur 2, P1/P2): boş tablo önceden çıplak `<td colSpan>` metni
  // basıyordu (ikon/açıklama/eylem yok) ve bu metin kaydırılabilir tablo genişliğine göre
  // ortalandığından 390px'te görünür alanın dışına kayıyordu (x≈370-660). Artık boş durumda tablo/
  // başlık satırı HİÇ render edilmiyor — ortak `EmptyState` kart genişliğine göre ortalanır.
  if (due.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-card">
        <EmptyState icon={CheckCircle2} title="Vadesi geçmiş fatura yok" description="Tüm satış faturaları vadesinde ya da tamamı tahsil edilmiş." />
      </div>
    );
  }

  return (
    <div>
      {/* Kriter 9 kök neden düzeltmesi (Tur 3, P1 finans-dunning-06): 8 sütunlu tablo 390px'te kart
          görünümüne düşmüyordu — ekranın birincil eylemi ("Taslak oluştur") tamamen görünür alanın
          dışında kalıyordu (x=819-955, viewport 390). Modüldeki ortak kart kalıbıyla (bkz.
          components/data-table/mobile-cards.tsx, loan-panel LoanCards, budget-panel mobil kartı)
          aynı fikir: <md'de tablo yerine tek sütun kart listesi, eylem butonu kartın İÇİNDE ve
          tam genişlik h-11 — yatay kaydırma gerektirmeden erişilebilir. */}
      <ul className="space-y-2 md:hidden">
        {due.map((r) => {
          const existing = r.hasDraft ? findExisting(r.id, r.level) : undefined;
          return (
            <li key={r.id} className="rounded-lg border border-border/70 bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-[14px] leading-5 font-medium">{r.partnerName}</div>
                <StatusBadge status={String(r.level)} label={LEVEL_LABEL[r.level]} tone={LEVEL_TONE[r.level]} />
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {r.docNo} <span aria-hidden className="text-muted-foreground/40"> · </span> vade {formatDate(r.dueDate)}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase">Gecikme</div>
                  <div className={cn('font-mono tabular-nums', r.daysOverdue > 30 && 'text-destructive')}>{r.daysOverdue} gün</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase">Bakiye</div>
                  <div className="font-mono tabular-nums">{formatMoney(r.residual, r.currency, { digits: 2 })}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Son hatırlatma: {r.lastDunningAt ? formatDate(r.lastDunningAt) : '—'}</div>
              <div className="mt-2.5">
                {existing && SENDABLE_STATUS.has(existing.status) ? (
                  <Button size="sm" variant="outline" className="h-11 w-full" onClick={() => setReviewing({ id: existing.id, docNo: r.docNo, partnerName: r.partnerName, channel: existing.channel, subject: existing.subject, body: existing.body })}>
                    <Eye className="size-3.5" /> İncele ve gönder
                  </Button>
                ) : existing ? (
                  <span className="text-xs text-muted-foreground">Gönderildi</span>
                ) : (
                  <Button size="sm" variant="outline" className="h-11 w-full" onClick={() => setCreatingFor(r)}>
                    <Sparkles className="size-3.5" /> Taslak oluştur
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border/70 bg-card md:block">
        <table className="w-full min-w-max text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium whitespace-nowrap">Müşteri</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Fatura</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Vade</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Gecikme</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Bakiye</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Seviye</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Son hatırlatma</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {due.map((r) => {
              const existing = r.hasDraft ? findExisting(r.id, r.level) : undefined;
              return (
                <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap">{r.partnerName}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.docNo}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(r.dueDate)}</td>
                  <td className={cn('px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums', r.daysOverdue > 30 && 'text-destructive')}>{r.daysOverdue} gün</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">{formatMoney(r.residual, r.currency, { digits: 2 })}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={String(r.level)} label={LEVEL_LABEL[r.level]} tone={LEVEL_TONE[r.level]} /></td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.lastDunningAt ? formatDate(r.lastDunningAt) : '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
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
          </tbody>
        </table>
      </div>
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

  // Kriter 3 kök neden düzeltmesi (Tur 3, P1 finans-dunning-07): non-compact EmptyState (px-6 py-16)
  // tek başına ~358px dikey alan kaplayıp 1440x900 ilk ekranın bilgi yoğunluğunu düşürüyordu —
  // modüldeki diğer tablo-içi boş durumlar (bkz. budget-panel, forecast-panel) `compact` kullanıyor.
  if (actions.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-card">
        <EmptyState compact icon={Send} title="Henüz hatırlatma geçmişi yok" description="Vadesi geçen bir faturadan “Taslak oluştur” ile ilk hatırlatmayı gönderin." />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
      <table className="w-full min-w-max text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
            <th className="px-3 py-2 font-medium whitespace-nowrap">Fatura</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Müşteri</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Seviye</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Kanal</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Durum</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Gönderildi</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => {
            const Icon = CHANNEL_ICON[a.channel] ?? Mail;
            return (
              <tr key={a.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{a.invoiceDocNo}</td>
                <td className="px-3 py-2 whitespace-nowrap">{a.partnerName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{LEVEL_LABEL[a.level] ?? a.level}</td>
                <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Icon className="size-3.5" />{a.channel === 'email' ? 'E-posta' : 'WhatsApp'}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge
                    status={a.status}
                    label={a.status === 'sent' ? 'Gönderildi' : a.status === 'failed' ? 'Başarısız' : a.status === 'pending_approval' ? 'Onay bekliyor' : a.status === 'approved' ? 'Onaylandı' : 'Taslak'}
                    tone={a.status === 'sent' ? 'success' : a.status === 'failed' ? 'danger' : a.status === 'pending_approval' ? 'warning' : 'neutral'}
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{a.sentAt ? formatDate(a.sentAt) : '—'}{a.sentTo ? ` · ${a.sentTo}` : ''}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {SENDABLE_STATUS.has(a.status) ? (
                    <Button size="sm" variant="outline" onClick={() => setReviewing({ id: a.id, docNo: a.invoiceDocNo, partnerName: a.partnerName, channel: a.channel, subject: a.subject, body: a.body })}>
                      <Eye className="size-3.5" /> İncele ve gönder
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {reviewing ? <SendDialog seed={reviewing} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

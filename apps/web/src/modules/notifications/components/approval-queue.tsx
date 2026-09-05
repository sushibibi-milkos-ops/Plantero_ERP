'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, ArrowRight, Loader2, Sparkles, ShoppingBag, ClipboardList, Landmark, Receipt, FlaskConical, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatDateTime, formatMoney, formatTime } from '@/lib/format';
import { approveQueueItemAction, rejectQueueItemAction } from '../actions';
import type { ApprovalQueueItem } from '../queries';

const KIND_META: Record<string, { label: string; icon: typeof Sparkles }> = {
  purchase_draft: { label: 'Satın alma taslağı', icon: ShoppingBag },
  count_variance: { label: 'Sayım farkı', icon: ClipboardList },
  dunning_message: { label: 'Tahsilat hatırlatma', icon: Receipt },
  reconciliation: { label: 'Mutabakat önerisi', icon: Landmark },
  recipe_release: { label: 'Reçete devri', icon: FlaskConical },
  price_change: { label: 'Fiyat değişikliği', icon: Tag },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: kind, icon: Sparkles };
}

/** Güven eşiği: yeşil YALNIZCA yüksek güveni işaretler — düşük güveni de aynı yeşille göstermek
 *  rengi anlamsızlaştırır (Tur 1 P0 onaylar-02). Nötr/uyarı/başarı — StatusBadge ile aynı token'lar. */
function confidenceBadgeClass(c: number): string {
  if (c >= 0.8) return 'bg-success/12 text-success';
  if (c >= 0.5) return 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning';
  return 'bg-muted text-muted-foreground';
}

function rowKey(item: Pick<ApprovalQueueItem, 'kind' | 'id'>): string {
  return `${item.kind}:${item.id}`;
}

export function ApprovalQueue({ items }: { items: ApprovalQueueItem[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(items[0] ? rowKey(items[0]) : null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalQueueItem | null>(null);
  const [reason, setReason] = useState('');
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  // Sekmeler: tür başına adet (Tur 1 P1 onaylar-07 — tek kuyruk sekmesiz ve ayırt edilemezdi).
  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    return [{ key: 'all', label: 'Tümü', count: items.length }, ...[...counts.entries()].map(([key, count]) => ({ key, label: kindMeta(key).label, count }))];
  }, [items]);

  const filtered = useMemo(() => (kindFilter === 'all' ? items : items.filter((i) => i.kind === kindFilter)), [items, kindFilter]);

  // Filtre değişince ya da liste küçülünce seçim geçerli kalmıyorsa ilk satıra düş.
  useEffect(() => {
    if (!filtered.length) { setSelectedKey(null); return; }
    if (!filtered.some((i) => rowKey(i) === selectedKey)) setSelectedKey(rowKey(filtered[0]!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  // Seçim her değiştiğinde görünür alana kaydır + odağı taşı (Tur 1 P0 onaylar-01 — seçim viewport
  // dışına çıkabiliyor, "A" tuşu görünmeyen bir kaydı onaylayabiliyordu).
  useEffect(() => {
    if (!selectedKey) return;
    const el = rowRefs.current.get(selectedKey);
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus({ preventScroll: true });
  }, [selectedKey]);

  const current = filtered.find((i) => rowKey(i) === selectedKey) ?? null;

  const approve = useMemo(
    () => async (item: ApprovalQueueItem) => {
      setBusyId(item.id);
      const res = await approveQueueItemAction({ kind: item.kind, id: item.id });
      setBusyId(null);
      if (res.ok) toast.success(`${kindMeta(item.kind).label} onaylandı`);
      else toast.error(res.error);
    },
    [],
  );
  const reject = useMemo(
    () => async (item: ApprovalQueueItem, reasonText: string | null) => {
      setBusyId(item.id);
      const res = await rejectQueueItemAction({ kind: item.kind, id: item.id, reason: reasonText });
      setBusyId(null);
      if (res.ok) toast.success(`${kindMeta(item.kind).label} reddedildi`);
      else toast.error(res.error);
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable || target?.closest('[contenteditable="true"]')) return;
      // Tur 2 P0 onaylar-09: Reddet ConfirmDialog'u açıkken bu dinleyici hâlâ çalışıyordu — dialog
      // arkasındaki seçim "j" ile kayıyor, "a" ise kullanıcı reddetmek üzereyken BAŞKA bir kaydı geri
      // alınamaz biçimde onaylayabiliyordu (onay postJournalEntry/postStockMove tetikler). `rejectTarget`
      // kontrolü bu bileşenin kendi dialogunu, genel `[role=dialog]` sorgusu ileride açılabilecek başka
      // bir modali (ör. komut paleti) da kapsar.
      if (rejectTarget !== null) return;
      if (target?.closest('[role="dialog"],[role="alertdialog"]')) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      if (!filtered.length) return;
      const idx = current ? filtered.findIndex((i) => rowKey(i) === selectedKey) : -1;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); setSelectedKey(rowKey(filtered[Math.min(filtered.length - 1, idx + 1)]!)); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setSelectedKey(rowKey(filtered[Math.max(0, idx - 1)]!)); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); if (current) void approve(current); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (current) { setRejectTarget(current); setReason(''); } }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, current, selectedKey, approve, rejectTarget]);

  if (!items.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Onay bekleyen kayıt yok"
        description="Yeni bir taslak, sayım farkı ya da mutabakat önerisi oluştuğunda burada görünür."
        action={
          <Button variant="outline" asChild>
            <Link href="/muhasebe/mutabakat">
              Mutabakat panosuna git <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Tur 2 P1 onaylar-10: sarmalayan (flex-wrap) şerit 390px'te 2 satıra taşıp sekmeleri
            32px'e sıkıştırıyordu. Ortak ui/tabs.tsx desenindeki gibi tek satır + yatay kaydırma
            (flex-nowrap overflow-x-auto) ve mobilde 44px dokunma hedefi (h-11 md:h-8). */}
        <div role="tablist" aria-label="Onay türü" className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={kindFilter === t.key}
              onClick={() => setKindFilter(t.key)}
              className={cn(
                'h-11 shrink-0 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors md:h-8',
                kindFilter === t.key ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label} <span className="tabular-nums text-muted-foreground">({t.count})</span>
            </button>
          ))}
        </div>
        {/* Tur 3 P2 onaylar-17: kbd çipleri 10px ayrı bir kademe açıyordu (içerikte 5 font kademesi:
            24/14/13/11/10). "meta" kademesiyle (11px) birleştirildi — h1 24 + gövde 13 + meta 11
            içinde ≤4 kademeye indi (PageHeader açıklaması ortak bileşen, bkz. sharedComponentRequests). */}
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border bg-muted px-1 py-px font-mono text-[11px]">J</kbd>/<kbd className="rounded border bg-muted px-1 py-px font-mono text-[11px]">K</kbd> gezin ·{' '}
          <kbd className="rounded border bg-muted px-1 py-px font-mono text-[11px]">A</kbd> onayla · <kbd className="rounded border bg-muted px-1 py-px font-mono text-[11px]">R</kbd> reddet
        </p>
      </div>

      <div role="listbox" aria-label="Onay kuyruğu" className="divide-y divide-border/60 rounded-xl border border-border/60">
        {filtered.map((item) => {
          const meta = kindMeta(item.kind);
          const Icon = meta.icon;
          const key = rowKey(item);
          const isSelected = key === selectedKey;
          return (
            <div
              key={key}
              ref={(el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); }}
              role="option"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedKey(key)}
              onFocus={() => setSelectedKey(key)}
              className={cn(
                'cursor-default outline-none',
                isSelected ? 'bg-accent/40' : 'hover:bg-accent/20',
                'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50',
              )}
            >
              {/* Yoğun satır — 44px (dokunma hedefi) mobilde, masaüstünde 40px (Linear tablo yoğunluğu). */}
              <div className="flex h-11 items-center gap-2.5 px-3 sm:h-10">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</span>
                {/* Tur 3 P2 onaylar-16: rozet 640px altında tamamen gizliydi — kuyruk güvene göre
                    taranıyor, mobil kullanıcı sıralama sinyalini yalnızca kartı açarak görebiliyordu.
                    Artık her genişlikte görünür (onaylar-11'de tutar için yapılan düzeltmeyle aynı desen). */}
                {item.confidence !== null ? (
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums', confidenceBadgeClass(item.confidence))}>
                    %{Math.round(item.confidence * 100)}
                  </span>
                ) : null}
                {/* Tur 2 P1 onaylar-11: tutar 640px altında tamamen gizliydi — 12 kayıtlık kuyruğu
                    taşıyan kullanıcı hiçbir tutarı göremiyordu. Artık her genişlikte görünür. */}
                {item.amount !== null ? (
                  <span className="w-28 shrink-0 text-right text-[13px] font-medium tabular-nums">{formatMoney(item.amount)}</span>
                ) : null}
                <span className="hidden w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums md:inline-block">{formatTime(item.createdAt)}</span>
              </div>

              {isSelected ? (
                <div className="space-y-3 border-t border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      <Icon className="size-3.5 shrink-0 text-primary" /> {meta.label}
                    </span>
                    {/* Güven rozeti artık ana satırda her genişlikte görünür (onaylar-16) — burada
                        tekrar basmak aynı bilgiyi iki kez gösterirdi. Tutar da aynı sebeple (onaylar-11)
                        burada tekrar yok. */}
                    <span className="text-[11px] text-muted-foreground tabular-nums">{formatDateTime(item.createdAt)}</span>
                  </div>
                  {item.summary ? <p className="max-w-[70ch] text-[13px] text-muted-foreground">{item.summary}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" className="text-muted-foreground hover:text-destructive" disabled={busyId === item.id} onClick={(e) => { e.stopPropagation(); setRejectTarget(item); setReason(''); }}>
                      <XCircle className="size-3.5" /> Reddet
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={item.href}>Detay <ArrowRight className="size-3.5" /></Link>
                    </Button>
                    {/* Ekranda en fazla 1 dolgulu birincil buton — yalnızca seçili kartta (Tur 1 P1 onaylar-04).
                        Tur 2 P1 onaylar-12: sunucu eylemi sürerken yalnızca `disabled` görünüyordu, görünür
                        bekleme geri bildirimi yoktu — artık metin + spinner değişiyor. */}
                    <Button disabled={busyId === item.id} onClick={(e) => { e.stopPropagation(); void approve(item); }}>
                      {busyId === item.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                      {busyId === item.id ? 'Onaylanıyor…' : 'Onayla'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => { if (!v) setRejectTarget(null); }}
        title={rejectTarget ? `${kindMeta(rejectTarget.kind).label} reddedilsin mi?` : ''}
        description={rejectTarget?.title}
        destructive
        confirmLabel="Reddet"
        onConfirm={async () => { if (rejectTarget) await reject(rejectTarget, reason.trim() || null); setRejectTarget(null); }}
      >
        <Textarea placeholder="Red gerekçesi (opsiyonel)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="text-[13px]" />
      </ConfirmDialog>
    </div>
  );
}

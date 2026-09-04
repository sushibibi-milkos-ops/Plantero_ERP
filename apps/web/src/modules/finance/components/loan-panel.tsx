'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Percent, Landmark, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { recomputeVariableLoanAction } from '../loans-actions';
import { formatPctFixed } from '../format';
import type { LoanCardRow } from '../loans-queries';

const BURDEN_COLOR = 'var(--chart-5)';

/**
 * Kriter 9 kök neden düzeltmesi (Tur 2, P0): mobil için açık `grid-cols-1` yoktu — örtük tek sütun
 * `auto` track içeriğe göre (min/max-content) büyüyor, 390px'te 435px genişliğinde kart üretip
 * shell'in `overflow-x-clip` sarmalayıcısı tarafından kırpılıyordu (kaydırma bile mümkün değildi).
 * `grid-cols-1` kart genişliğini konteynerle sınırlar — kırpılma kaynağı tamamen ortadan kalkar.
 */
export function LoanCards({ loans, canEdit }: { loans: LoanCardRow[]; canEdit: boolean }) {
  // Kriter 7 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-10): kredi yoksa (henüz tanımlanmadı
  // ya da tümü kapandı) grid boş çiziliyordu — modülün diğer 6 boş durumuyla aynı ortak EmptyState.
  if (loans.length === 0) {
    return <div className="rounded-xl border border-border/70 bg-card"><EmptyState compact icon={Landmark} title="Kayıtlı kredi yok" description="Kredi seed'i çalışmamış olabilir ya da tüm krediler kapanmış." /></div>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {loans.map((l) => (
        <div key={l.id} className="rounded-xl border border-border/70 bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {/* Kriter 11 kök neden düzeltmesi: konsolide takvimin sütun başlıkları (L1…L7) kart
                    tarafında hiç görünmüyordu — kod rozeti eşleşmeyi %100 görünür kılar. */}
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">{l.code}</span>
                {/* Kriter 9 kök neden düzeltmesi (Tur 3, P1 finans-krediler-06): kartın birincil eylemi
                    (detaya git) 19,5px yükseklikli çıplak bir metin bağlantısıydı — 44px dokunma hedefi
                    hedefinin çok altında. `-my-3.5 py-3.5` dokunma alanını görsel boyutu değiştirmeden
                    büyütür (kutu daha yüksek ama negatif kenar boşluğu satır yüksekliğini geri alır);
                    py-2.5 (39.5px toplam) yetersiz kaldığı için py-3.5'e (47.5px) çıkarıldı. */}
                <Link href={`/finans/krediler/${l.id}`} className="-my-3.5 truncate py-3.5 text-[13px] font-semibold hover:text-primary hover:underline">{l.bankName}</Link>
              </div>
              <div className="line-clamp-2 text-[11px] text-muted-foreground">{l.productName}</div>
            </div>
            {/* Kriter 11 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-08): elle yazılmış rozet
                StatusBadge'in warning tonundaki sert kodlanmış oklch() değerini tekrarlıyordu (tek
                kaynak ilkesi ihlali) — artık ortak bileşen. */}
            <StatusBadge status={l.rateKind} tone={l.rateKind === 'variable' ? 'warning' : 'neutral'} label={l.rateKind === 'variable' ? 'Değişken faiz' : 'Sabit faiz'} dot={false} className="shrink-0" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
            <div>
              <div className="text-[11px] text-muted-foreground">Kalan anapara</div>
              <div className="font-mono font-medium tabular-nums">{formatMoney(l.remainingPrincipal, 'TRY', { digits: 0 })}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Aylık taksit</div>
              <div className="font-mono font-medium tabular-nums">{formatMoney(l.monthlyInstallment, 'TRY', { digits: 0 })}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Kalan taksit</div>
              <div className="font-mono font-medium tabular-nums">{l.remainingInstallments}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Bitiş</div>
              <div className="font-mono font-medium tabular-nums">{l.lastDue ? formatDate(l.lastDue) : '—'}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
            <span>Aylık faiz: <span className="font-mono tabular-nums text-foreground">{formatPctFixed(l.monthlyRatePct)}</span></span>
            {canEdit && l.rateKind === 'variable' ? <RateUpdateDialog loanId={l.id} loanCode={l.code} currentRate={l.monthlyRatePct} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Değişken faizli kredi için oran güncelleme diyaloğu — kart listesinde ve kredi detay sayfasında ortak. */
export function RateUpdateDialog({ loanId, loanCode, currentRate }: { loanId: string; loanCode: string; currentRate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(currentRate);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Kriter 9 kök neden düzeltmesi (Tur 3, P1 finans-krediler-06 + finans-krediler-detay-02):
          önceden çıplak (border'sız) yeşil bir metin bağlantısıydı — hem 20px yükseklikte (44px altı)
          hem de modülün PageHeader aksiyon kalıbının (Yeniden hesapla, Varsayımlar, Gerçekleşenleri
          yenile — hepsi outline Button) dışındaydı. Tek bileşen hem kart footer'ında hem kredi detayı
          PageHeader'ında kullanıldığından (bkz. dosya başı yorumu) artık ikisinde de aynı outline
          Button + h-11 md:h-8 kalıbı. */}
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 md:h-8">
          <Percent className="size-3.5" /> Oran güncelle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{loanCode} — faiz oranı güncelle</DialogTitle>
          <DialogDescription>Ödenmemiş tüm taksitler yeni orana göre yeniden hesaplanır (anapara/faiz bölüşümü).</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rate">Yeni aylık faiz oranı (%)</Label>
          <Input id="rate" value={rate} onChange={(e) => setRate(e.target.value)} className="font-mono tabular-nums" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Vazgeç</Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await recomputeVariableLoanAction({ loanId, newMonthlyRatePct: rate });
                if (res.ok) {
                  toast.success(`${res.data.updated} taksit yeniden hesaplandı`);
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(res.error);
                }
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Yeniden hesapla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BurdenChart({ points }: { points: Array<{ period: string; total: string }> }) {
  const data = points.map((p) => ({ period: p.period, total: Number(p.total) }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-burden" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={BURDEN_COLOR} stopOpacity={0.16} />
            <stop offset="95%" stopColor={BURDEN_COLOR} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="period" tickFormatter={(v: string) => formatDate(`${v}-01`).slice(3)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tickFormatter={(v: number) => formatMoney(v, 'TRY', { digits: 0, compact: true })} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          isAnimationActive={false}
          wrapperStyle={{ outline: 'none' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-border/70 bg-popover p-2.5 text-[13px] shadow-md">
                <div className="mb-1 font-medium">{formatDate(`${label}-01`)}</div>
                <span className="num tabular-nums">{formatMoney(payload[0]!.value as number, 'TRY', { digits: 0 })}</span>
              </div>
            ) : null
          }
        />
        <Area type="linear" dataKey="total" name="Toplam aylık taksit" stroke={BURDEN_COLOR} strokeWidth={2} fill="url(#fill-burden)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type ConsolidatedCell = { installment: string; status: string } | undefined;

export function ConsolidatedScheduleTable({
  periods,
  loanCodes,
  cellByKey,
  totalsByPeriod,
}: {
  periods: string[];
  loanCodes: string[];
  cellByKey: Map<string, { installment: string; status: string }>;
  totalsByPeriod: Map<string, { installment: string; paidCount: number; totalCount: number }>;
}) {
  // Kriter 7 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-10): dönem yoksa (taksit takvimi
  // hiç üretilmemiş) yalnızca başlık satırı olan boş bir tablo çiziliyordu.
  if (periods.length === 0) {
    return <div className="rounded-xl border border-border/70 bg-card"><EmptyState compact icon={CalendarClock} title="Taksit takvimi yok" description="Krediler tanımlandığında konsolide takvim burada görünür." /></div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border/60">
            <th className="sticky left-0 z-10 min-w-28 bg-card px-3 py-2 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Dönem</th>
            {loanCodes.map((code) => (
              <th key={code} className="min-w-24 px-3 py-2 text-right text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{code}</th>
            ))}
            {/* Kriter 9 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-09): DÖNEM sola sabitken
                TOPLAM (en önemli sütun) sabitlenmemişti — 390px'te ilk görünümde 7 sütun kaydırmadan
                görünmüyordu. DÖNEM ile SİMETRİK: sağa sabitlenir, ikisi de her zaman görünür kalır. */}
            <th className="sticky right-0 z-10 min-w-28 bg-card px-3 py-2 text-right text-[11px] font-semibold tracking-wide text-muted-foreground uppercase shadow-[-1px_0_0_0_var(--border)]">Toplam</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const totals = totalsByPeriod.get(period);
            return (
              <tr key={period} className="border-b border-border/40 hover:bg-muted/30">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5">{formatDate(`${period}-01`)}</td>
                {loanCodes.map((code) => {
                  const cell = cellByKey.get(`${period}:${code}`);
                  if (!cell) return <td key={code} className="px-3 py-1.5 text-right text-muted-foreground/40">—</td>;
                  // Kriter 4 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-11): yeşil ekranda iki
                  // anlam taşıyordu (marka/nav primary + "ödendi" success) — ödendi hücresinden success
                  // kaldırıldı, ayrım yalnızca ✓ işareti + nötr renkle kuruluyor.
                  return (
                    <td key={code} className={cn('px-3 py-1.5 text-right font-mono tabular-nums', cell.status === 'paid' ? 'text-muted-foreground' : cell.status === 'overdue' ? 'text-destructive' : 'text-foreground')}>
                      {formatMoney(cell.installment, 'TRY', { digits: 0 })}
                      {cell.status === 'paid' ? ' ✓' : ''}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 text-right font-mono font-semibold tabular-nums shadow-[-1px_0_0_0_var(--border)]">
                  {totals ? formatMoney(totals.installment, 'TRY', { digits: 0 }) : '—'}
                  {totals ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">({totals.paidCount}/{totals.totalCount})</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Kredi detayı (`/finans/krediler/[id]`) — tüm amortisman takvimi: taksit/faiz/anapara/kalan bakiye + durum. */
export function LoanInstallmentsTable({ installments }: { installments: Array<{ id: string; seq: number; dueDate: string; installment: string; interest: string; principal: string; remainingAfter: string; status: string; paidAt: string | null }> }) {
  // Kriter 3 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-detay-04): tamamı "Planlandı"/"—"
  // olan bir amortisman takviminde DURUM ve ÖDENDİ sütunları 36/36 satırda sıfır bilgi taşıyordu.
  // Yalnızca en az bir taksit gerçekten ödenmiş/gecikmişse (ayrım anlamlıysa) bu iki sütun gösterilir.
  const hasStatusVariety = installments.some((i) => i.status !== 'scheduled');
  const colCount = hasStatusVariety ? 8 : 6;
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
      <table className="w-full min-w-max text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <th className="px-3 py-2 whitespace-nowrap">#</th>
            {/* Kriter 9 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-detay-06): hiçbir sütun sabit
                değildi, 390px'te VADE dahil yatay kaydırma gerektiriyordu — ConsolidatedScheduleTable
                ile aynı kalıp (DÖNEM sticky left-0), burada VADE sabitlenir. */}
            <th className="sticky left-0 z-10 bg-card px-3 py-2 whitespace-nowrap shadow-[1px_0_0_0_var(--border)]">Vade</th>
            <th className="px-3 py-2 text-right whitespace-nowrap">Taksit</th>
            <th className="px-3 py-2 text-right whitespace-nowrap">Faiz + BSMV</th>
            <th className="px-3 py-2 text-right whitespace-nowrap">Anapara</th>
            <th className="px-3 py-2 text-right whitespace-nowrap">Kalan bakiye</th>
            {hasStatusVariety ? (
              <>
                <th className="px-3 py-2 whitespace-nowrap">Durum</th>
                <th className="px-3 py-2 whitespace-nowrap">Ödendi</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {installments.map((i) => (
            <tr key={i.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
              <td className="px-3 py-1.5 font-mono whitespace-nowrap tabular-nums text-muted-foreground">{i.seq}</td>
              <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 shadow-[1px_0_0_0_var(--border)]">{formatDate(i.dueDate)}</td>
              <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums">{formatMoney(i.installment, 'TRY', { digits: 0 })}</td>
              <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums text-muted-foreground">{formatMoney(i.interest, 'TRY', { digits: 0 })}</td>
              <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums text-muted-foreground">{formatMoney(i.principal, 'TRY', { digits: 0 })}</td>
              <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums">{formatMoney(i.remainingAfter, 'TRY', { digits: 0 })}</td>
              {hasStatusVariety ? (
                <>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className={cn('inline-flex items-center gap-1.5 text-[11px]', i.status === 'paid' ? 'text-success' : i.status === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                      <span className={cn('size-1.5 rounded-full', i.status === 'paid' ? 'bg-success' : i.status === 'overdue' ? 'bg-destructive' : 'bg-muted-foreground/50')} />
                      {i.status === 'paid' ? 'Ödendi' : i.status === 'overdue' ? 'Gecikti' : 'Planlandı'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{i.paidAt ? formatDate(i.paidAt) : '—'}</td>
                </>
              ) : null}
            </tr>
          ))}
          {installments.length === 0 ? (
            <tr>
              {/* Kriter 7 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-detay-03): düz metin hücresi
                  yerine modülün diğer 6 boş durumuyla aynı ortak EmptyState. */}
              <td colSpan={colCount} className="p-0">
                <EmptyState compact icon={CalendarClock} title="Taksit takvimi yok" description="Bu kredi için amortisman satırı üretilmedi." />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

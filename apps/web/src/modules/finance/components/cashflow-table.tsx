'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { formatMoney, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { applyCashflowOverrideAction } from '../cashflow-actions';
import type { CashflowLineDto, ChannelRef } from '../cashflow-queries';

type Scenario = 'base' | 'optimistic' | 'pessimistic';

function EditableCell({ value, onCommit, disabled }: { value: string; onCommit: (next: string | null) => void; disabled?: boolean }) {
  const rounded = String(Math.round(Number(value)));
  const [draft, setDraft] = useState(rounded);
  const [pending, startTransition] = useTransition();

  return (
    <input
      disabled={disabled || pending}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed === '' || trimmed === rounded) {
          setDraft(rounded);
          return;
        }
        const parsed = Number(trimmed.replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(parsed)) {
          toast.error('Geçersiz sayı');
          setDraft(rounded);
          return;
        }
        startTransition(() => onCommit(String(parsed)));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(rounded);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'w-24 min-w-24 rounded border-b border-dashed border-primary/40 bg-transparent px-1 py-0.5 text-right font-mono text-[12px] text-primary tabular-nums outline-none',
        'focus:border-primary focus:ring-1 focus:ring-primary/30',
        pending && 'opacity-50',
      )}
      value={draft}
    />
  );
}

function Cell({ value, muted, bold }: { value: string; muted?: boolean; bold?: boolean }) {
  return <td className={cn('px-3 py-1.5 text-right font-mono text-[12px] tabular-nums', muted && 'text-muted-foreground', bold && 'font-semibold')}>{formatMoney(value, 'TRY', { digits: 0 })}</td>;
}

function RowLabel({ children, indent, className }: { children: React.ReactNode; indent?: boolean; className?: string }) {
  return (
    <th scope="row" className={cn('sticky left-0 z-10 min-w-[200px] whitespace-nowrap bg-card px-3 py-1.5 text-left text-[12px] font-normal text-foreground', indent && 'pl-6 text-muted-foreground', className)}>
      {children}
    </th>
  );
}

export function CashflowTable({ lines, channels, scenario, canEdit }: { lines: CashflowLineDto[]; channels: ChannelRef[]; scenario: Scenario; canEdit: boolean }) {
  const router = useRouter();

  const commitOverride = (period: string, field: 'revenue' | 'otherInflows' | 'investments', value: string | null, channelCode?: string) => {
    void (async () => {
      const res = await applyCashflowOverrideAction({ scenario, period, field, channelCode, value });
      if (res.ok) {
        toast.success('Güncellendi — projeksiyon yeniden hesaplandı');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    })();
  };

  const rowClass = 'border-b border-border/50 hover:bg-muted/30';
  const sectionRowClass = 'border-b border-border/60 bg-muted/20';

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border/60">
            <th className="sticky left-0 z-20 min-w-[200px] bg-card px-3 py-2 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Dönem</th>
            {lines.map((l) => (
              <th key={l.period} className="min-w-24 whitespace-nowrap px-3 py-2 text-right text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {formatDate(`${l.period}-01`).slice(3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.id} className={rowClass}>
              <RowLabel indent>Ciro — {c.name}</RowLabel>
              {lines.map((l) => (
                <td key={l.period} className="px-3 py-1.5 text-right">
                  {canEdit ? (
                    <EditableCell value={l.revenueByChannel[c.code] ?? '0'} onCommit={(v) => commitOverride(l.period, 'revenue', v, c.code)} />
                  ) : (
                    <span className="font-mono text-[12px] tabular-nums">{formatMoney(l.revenueByChannel[c.code] ?? '0', 'TRY', { digits: 0 })}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className={sectionRowClass}>
            <RowLabel className="font-semibold">TOPLAM CİRO</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.revenueTotal} bold />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Tahsilat</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.collections} />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Değişken gider</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.variableCosts} muted />)}
          </tr>
          <tr className={sectionRowClass}>
            <RowLabel className="font-semibold">Brüt kâr</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.grossProfit} bold />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Sabit giderler</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.fixedExpenses} muted />)}
          </tr>
          <tr className={sectionRowClass}>
            <RowLabel className="font-semibold">FAVÖK</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.ebitda} bold />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Kredi faizi + BSMV</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.loanInterest} muted />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Kurumlar vergisi</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.corporateTax} muted />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Kredi anapara</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.loanPrincipal} muted />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Net KDV ödemesi</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.netVat} muted />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Diğer girişler</RowLabel>
            {lines.map((l) => (
              <td key={l.period} className="px-3 py-1.5 text-right">
                {canEdit ? <EditableCell value={l.otherInflows} onCommit={(v) => commitOverride(l.period, 'otherInflows', v)} /> : <span className="font-mono text-[12px] tabular-nums">{formatMoney(l.otherInflows, 'TRY', { digits: 0 })}</span>}
              </td>
            ))}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Yatırım / diğer çıkışlar</RowLabel>
            {lines.map((l) => (
              <td key={l.period} className="px-3 py-1.5 text-right">
                {canEdit ? <EditableCell value={l.investments} onCommit={(v) => commitOverride(l.period, 'investments', v)} /> : <span className="font-mono text-[12px] tabular-nums">{formatMoney(l.investments, 'TRY', { digits: 0 })}</span>}
              </td>
            ))}
          </tr>
          <tr className={cn(sectionRowClass, 'border-t-2 border-t-border')}>
            <RowLabel className="font-semibold">NET NAKİT AKIŞI</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.netCashflow} bold />)}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Dönem başı nakit</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.openingCash} muted />)}
          </tr>
          <tr className={cn(sectionRowClass, 'border-b-2 border-b-border')}>
            <RowLabel className="font-semibold">DÖNEM SONU NAKİT</RowLabel>
            {lines.map((l) => (
              <td key={l.period} className={cn('px-3 py-1.5 text-right font-mono text-[12px] font-semibold tabular-nums', Number(l.closingCash) < 0 && 'text-destructive')}>
                {formatMoney(l.closingCash, 'TRY', { digits: 0 })}
              </td>
            ))}
          </tr>
          <tr className={rowClass}>
            <RowLabel>Hedef ciro (başabaş)</RowLabel>
            {lines.map((l) => <Cell key={l.period} value={l.breakEvenRevenue} muted />)}
          </tr>
          {lines.some((l) => l.actualRevenue !== null) ? (
            <>
              <tr className={rowClass}>
                <RowLabel className="text-primary">Gerçekleşen ciro</RowLabel>
                {lines.map((l) => (
                  <td key={l.period} className="px-3 py-1.5 text-right font-mono text-[12px] text-primary tabular-nums">
                    {l.actualRevenue !== null ? formatMoney(l.actualRevenue, 'TRY', { digits: 0 }) : <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
              <tr className={rowClass}>
                <RowLabel className="text-primary">Gerçekleşen net nakit</RowLabel>
                {lines.map((l) => (
                  <td key={l.period} className="px-3 py-1.5 text-right font-mono text-[12px] text-primary tabular-nums">
                    {l.actualNetCashflow !== null ? formatMoney(l.actualNetCashflow, 'TRY', { digits: 0 }) : <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            </>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

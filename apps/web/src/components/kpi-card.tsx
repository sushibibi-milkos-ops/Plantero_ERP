'use client';

import NumberFlow from '@number-flow/react';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkline } from './sparkline';

export type KpiFormat = 'money' | 'qty' | 'int' | 'pct';

/**
 * KPI kartı: NumberFlow ile canlı sayı, delta rozeti, opsiyonel sparkline.
 * `value` ekran sayısıdır (Decimal string'den Number'a yalnızca gösterim için çevrilir).
 */
export function KpiCard({
  title,
  value,
  format = 'int',
  currency = 'TRY',
  suffix,
  delta,
  deltaLabel = 'geçen döneme göre',
  invertDelta = false,
  sparkline,
  icon: Icon,
  href,
  hint,
  className,
}: {
  title: string;
  value: number | string;
  format?: KpiFormat;
  currency?: string;
  /** Miktar birimi (`format='qty'` için) */
  suffix?: string;
  /** Yüzde puanı: 12.5 → +%12,5 */
  delta?: number | null;
  deltaLabel?: string;
  /** Düşüş iyiyse (örn. fire, vadesi geçen) */
  invertDelta?: boolean;
  sparkline?: number[];
  icon?: LucideIcon;
  href?: string;
  hint?: string;
  className?: string;
}) {
  const num = typeof value === 'string' ? Number(value) : value;
  const nfFormat: Intl.NumberFormatOptions =
    format === 'money'
      ? { style: 'currency', currency, maximumFractionDigits: num >= 100_000 ? 0 : 2, minimumFractionDigits: num >= 100_000 ? 0 : 2 }
      : format === 'pct'
        ? { style: 'percent', maximumFractionDigits: 1 }
        : format === 'qty'
          ? { maximumFractionDigits: 1 }
          : { maximumFractionDigits: 0 };
  const displayValue = format === 'pct' ? num / 100 : num;

  const dir = delta === null || delta === undefined || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = dir === 'flat' ? null : invertDelta ? dir === 'down' : dir === 'up';
  const DeltaIcon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-muted-foreground">{title}</div>
        {Icon ? <Icon className="size-4 text-muted-foreground/70" strokeWidth={1.75} /> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="num text-[26px] leading-none font-semibold tracking-tight tabular-nums md:text-[28px]">
            <NumberFlow value={displayValue} locales="tr-TR" format={nfFormat} suffix={suffix ? ` ${suffix}` : undefined} />
          </div>
          {delta !== undefined ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-medium tabular-nums',
                  good === null && 'bg-muted text-muted-foreground',
                  good === true && 'bg-success/12 text-success',
                  good === false && 'bg-destructive/10 text-destructive',
                )}
              >
                <DeltaIcon className="size-3" />
                {delta === null || delta === undefined ? '—' : `%${Math.abs(delta).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
              </span>
              <span className="truncate text-muted-foreground">{deltaLabel}</span>
            </div>
          ) : hint ? (
            <div className="mt-2 truncate text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </div>
        {sparkline?.length ? (
          <Sparkline data={sparkline} tone={good === false ? 'danger' : good === true ? 'success' : 'muted'} className="mb-0.5" />
        ) : null}
      </div>
    </>
  );

  const cls = cn(
    'group relative block rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.03)]',
    href && 'hover:border-border hover:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_20px_-12px_rgb(0_0_0/0.15)]',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cls} data-pressable>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

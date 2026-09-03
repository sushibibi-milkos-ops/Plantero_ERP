'use client';

import { isValidElement } from 'react';
import NumberFlow, { type Format as NumberFlowFormat } from '@number-flow/react';
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
  fractionDigits,
  delta,
  deltaLabel = 'önceki dönem',
  invertDelta = false,
  sparkline,
  icon: Icon,
  href,
  hint,
  onClick,
  active = false,
  variant = 'card',
  className,
}: {
  title: string;
  value: number | string;
  format?: KpiFormat;
  currency?: string;
  /** Miktar birimi (`format='qty'` için) */
  suffix?: string;
  /** Para KPI'ları için ondalık hane sayısı — bir KPI şeridindeki tüm kartlara aynı değer geçilmeli
   *  (Stripe finans ekranlarında bir şerit asla karışık hassasiyet göstermez). Varsayılan 0. */
  fractionDigits?: number;
  /** Yüzde puanı: 12.5 → +%12,5 */
  delta?: number | null;
  deltaLabel?: string;
  /** Düşüş iyiyse (örn. fire, vadesi geçen) */
  invertDelta?: boolean;
  sparkline?: number[];
  /** Lucide bileşeni (istemciden) veya hazır element (sunucu bileşeninden `<Icon />`) */
  icon?: LucideIcon | React.ReactElement;
  href?: string;
  hint?: string;
  /** Kart bir seçilebilir filtre düğmesiyse (ör. SKT kovaları) tıklama işleyicisi */
  onClick?: () => void;
  /** `onClick` ile birlikte: kart şu an seçili mi (vurgulu çerçeve) */
  active?: boolean;
  /** `card` (varsayılan): kendi çerçeveli/gölgeli kutusu — mevcut kullanım. `strip`: Stripe tarzı,
   *  çerçevesiz/gölgesiz, sabit 80px yükseklik; masaüstünde `KpiStripRow` ile sarmalanıp dikey
   *  hairline'larla ayrılır, mobilde kendi küçük kartına (140×72) döner (bkz. `kpi-strip.tsx`). */
  variant?: 'card' | 'strip';
  className?: string;
}) {
  const num = typeof value === 'string' ? Number(value) : value;
  const nfFormat: NumberFlowFormat =
    format === 'money'
      ? { style: 'currency', currency, maximumFractionDigits: fractionDigits ?? 0, minimumFractionDigits: fractionDigits ?? 0 }
      : format === 'pct'
        ? { style: 'percent', maximumFractionDigits: 1 }
        : format === 'qty'
          ? { maximumFractionDigits: 1 }
          : { maximumFractionDigits: 0 };
  const displayValue = format === 'pct' ? num / 100 : num;

  const dir = delta === null || delta === undefined || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = dir === 'flat' ? null : invertDelta ? dir === 'down' : dir === 'up';
  const DeltaIcon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;

  const valueNode = <NumberFlow value={displayValue} locales="tr-TR" format={nfFormat} suffix={suffix ? ` ${suffix}` : undefined} />;
  const deltaNode =
    delta !== undefined ? (
      // flex-wrap: dar kartlarda (ör. bir şeritte 6 KPI) etiket satır sonuna kırpılmadan
      // taşar — tek satırda `truncate` yerine bu, hiçbir karakteri kesmez (Tur 1 bulgusu).
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px font-medium tabular-nums',
            good === null && 'bg-muted text-muted-foreground',
            good === true && 'bg-success/12 text-success',
            good === false && 'bg-destructive/10 text-destructive',
          )}
        >
          <DeltaIcon className="size-3" />
          {delta === null || delta === undefined ? '—' : `%${Math.abs(delta).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
        </span>
        <span className="whitespace-nowrap text-muted-foreground">{deltaLabel}</span>
      </div>
    ) : hint ? (
      <div className="mt-2 truncate text-xs text-muted-foreground">{hint}</div>
    ) : null;

  const isStrip = variant === 'strip';

  const body = isStrip ? (
    // Stripe tarzı yoğun satır: ikon yok (etiketin tek satıra sığması için alan ikona değil metne
    // ayrılır), etiket tek satır (text-xs truncate), sabit yükseklik — bir şeritteki tüm kartlar
    // aynı taban çizgisinde durur (Tur 2 bulgusu: 115px vs 134px karışık yükseklik).
    <>
      <div className="truncate text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 truncate text-[19px] leading-none font-semibold tracking-tight tabular-nums">{valueNode}</div>
      {hint && delta === undefined ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div> : deltaNode}
    </>
  ) : (
    <>
      <div className="flex min-h-[34px] items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-muted-foreground">{title}</div>
        {Icon ? (
          isValidElement(Icon) ? (
            <span className="[&>svg]:size-4 [&>svg]:text-muted-foreground/70">{Icon}</span>
          ) : (
            <Icon className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
          )
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[22px] leading-none font-semibold tracking-tight tabular-nums">{valueNode}</div>
          {deltaNode}
        </div>
        {sparkline?.length ? (
          <Sparkline data={sparkline} tone={good === false ? 'danger' : good === true ? 'success' : 'muted'} className="mb-0.5" />
        ) : null}
      </div>
    </>
  );

  const cls = cn(
    'group relative block text-left',
    isStrip
      ? [
          // Masaüstü: çerçevesiz/gölgesiz, sabit 80px — dış ayraçlar `KpiStripRow`'un divide-x'inden
          // gelir. Mobil: kendi küçük kartı (140×72), yatay kaydırma şeridinde snap-start.
          'h-[72px] w-[140px] shrink-0 snap-start rounded-lg border border-border/70 bg-card px-3 py-2',
          'md:h-20 md:w-auto md:flex-1 md:shrink md:snap-align-none md:rounded-none md:border-0 md:bg-transparent md:px-4 md:py-3',
        ]
      : 'rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.03)]',
    (href || onClick) && (isStrip ? 'hover:bg-accent/40 md:hover:bg-accent/30' : 'hover:border-border hover:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_20px_-12px_rgb(0_0_0/0.15)]'),
    active && (isStrip ? 'bg-primary/5 md:bg-primary/5' : 'border-primary/60 ring-2 ring-primary/15'),
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cls} data-pressable>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} data-pressable aria-pressed={active}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

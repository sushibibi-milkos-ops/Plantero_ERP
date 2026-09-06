'use client';

import { isValidElement } from 'react';
import NumberFlow, { type Format as NumberFlowFormat } from '@number-flow/react';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMoneyTone } from '@/lib/format';
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
  stripCompact = false,
  className,
}: {
  title: string;
  /** `null`: hesaplanamaz/veri yok — "0" DEĞİL, dürüst bir "—" basılır (Tur 5 P1 bulgusu: "Ortalama
   *  kabul süresi: 0 dk" veri yokken "tüm kabuller anında kapanıyor" diye okunuyordu). */
  value: number | string | null;
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
  /** `KpiStripRow` 3 ya da daha az kart taşırken enjekte eder: masaüstünde `flex-1` yerine sabit
   *  min genişlik kullanılır — aksi halde az sayıda kart 1600px'lik şeride yayılıp aralarında
   *  ~500px'lik anlamsız boşluklar oluşturuyordu (Tur 4 P1 bulgusu). */
  stripCompact?: boolean;
  className?: string;
}) {
  const num = value === null ? null : typeof value === 'string' ? Number(value) : value;
  const nfFormat: NumberFlowFormat =
    format === 'money'
      ? { style: 'currency', currency, maximumFractionDigits: fractionDigits ?? 0, minimumFractionDigits: fractionDigits ?? 0 }
      : format === 'pct'
        ? { style: 'percent', maximumFractionDigits: 1 }
        : format === 'qty'
          ? { maximumFractionDigits: 1 }
          : { maximumFractionDigits: 0 };
  const displayValue = num === null ? null : format === 'pct' ? num / 100 : num;

  const dir = delta === null || delta === undefined || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = dir === 'flat' ? null : invertDelta ? dir === 'down' : dir === 'up';
  const DeltaIcon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const isStrip = variant === 'strip';

  // Kök neden (Tur 4 P1 shell k6 — finans-dunning-05): sıfır KPI değerleri ("₺0", "0") tam
  // kontrastta basılıyordu; dolu ve boş (sıfır) durum görsel olarak ayrışmıyordu (ör.
  // /finans/tahsilat-takibi'de "61-90 gün: ₺0" tıpkı dolu bir tutar gibi göze çarpıyordu).
  // Tek yerde (ortak bileşen) soluklaştırılır — tüm modüllere yayılır.
  const isZero = num === 0;
  // Kök neden (P1 shell-kpicard-neg-money-color-01, kriter 4/11): aynı tutar tek ekranda iki farklı
  // renkte basılıyordu — KPI şeridinde nötr, hemen altındaki MoneyCell'de kırmızı (ör. /kokpit
  // "Banka toplamı −₺254.348" vs "Toplam (TRY hesaplar) −₺254.348,50"). Negatiflik kuralı artık
  // MoneyCell ile PAYLAŞILAN `getMoneyTone` yardımcısından gelir — tek kaynak, iki bileşen; negatif
  // bakiye ya her yerde kırmızıdır ya hiçbir yerde. Yalnızca `format='money'` için (int/qty/pct
  // negatifi ayrı bir anlam taşımaz, bu bulgu yalnızca para tutarlarını kapsıyordu).
  const isNegativeMoney = format === 'money' && getMoneyTone(value) === 'negative';
  const valueNode =
    displayValue === null ? (
      <span className="text-muted-foreground/60">—</span>
    ) : (
      <NumberFlow
        value={displayValue}
        locales="tr-TR"
        format={nfFormat}
        suffix={suffix ? ` ${suffix}` : undefined}
        className={isNegativeMoney ? 'text-destructive' : isZero ? 'text-muted-foreground' : undefined}
      />
    );
  const deltaNode =
    delta !== undefined ? (
      // flex-wrap: dar kartlarda (ör. bir şeritte 6 KPI) etiket satır sonuna kırpılmadan
      // taşar — tek satırda `truncate` yerine bu, hiçbir karakteri kesmez (Tur 1 bulgusu).
      <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs', isStrip ? 'mt-1' : 'mt-2')}>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px font-medium tabular-nums',
            good === null && 'bg-muted text-muted-foreground',
            good === true && 'bg-success/12 text-success',
            good === false && 'bg-destructive/10 text-destructive',
          )}
        >
          <DeltaIcon className="size-3" />
          {/* Kök neden (Tur 11 P1 shell-kokpit-kpi-delta-01): `delta===0` önceden "%0" basıyordu —
              bölen yokken basılan dürüst "—" ile aynı duruma (hiçbir gerçek karşılaştırma yok/
              anlamlı değil) görsel olarak FARKLI davranıyordu, oysa ikisi de aynı "sinyal yok"
              bilgisini taşır (bkz. `dir`/`good` hesaplaması: 0 zaten null ile aynı 'flat'/muted
              dala düşüyor, yalnızca metin farklıydı). Artık ikisi de aynı "—" basar. */}
          {delta === null || delta === undefined || delta === 0 ? '—' : `%${Math.abs(delta).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
        </span>
        <span className="whitespace-nowrap text-muted-foreground">{deltaLabel}</span>
      </div>
    ) : hint ? (
      <div className={cn('truncate text-muted-foreground', isStrip ? 'mt-1 text-[11px]' : 'mt-2 text-xs')}>{hint}</div>
    ) : (
      // Tur 4 P2 bulgusu: delta VE hint ikisi de yokken hiçbir yer ayrılmıyordu — bir şeritte
      // (ör. /satis/net-ciro: 6 KPI'nin 5'i deltasız, /kokpit: 4'ün 1'i) taban çizgileri kayıyor,
      // tek dolu delta cipi seride tek başına asılı kalıp hangi metriğe ait olduğu belirsizleşiyordu.
      // Sabit yükseklikte boş (aria-hidden) bir yer tutucu, seridteki tüm kartları aynı taban
      // çizgisinde tutar — delta chip'inin (text-xs, py-px) ve hint satırının gerçek yüksekliğiyle eşit.
      <div className={isStrip ? 'mt-1 h-[15px]' : 'mt-2 h-[18px]'} aria-hidden />
    );

  const body = isStrip ? (
    // Stripe tarzı yoğun satır: ikon yok (etiketin tek satıra sığması için alan ikona değil metne
    // ayrılır), etiket tek satır (text-xs truncate), sabit yükseklik — bir şeritteki tüm kartlar
    // aynı taban çizgisinde durur (Tur 2 bulgusu: 115px vs 134px karışık yükseklik).
    <>
      <div className="truncate text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 truncate text-[19px] leading-none font-semibold tracking-tight tabular-nums">{valueNode}</div>
      {deltaNode}
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
        {/* Kök neden (Tur 1 P0 kokpit-kpi-clip-01): sparkline sabit ~96px genişlik alıyordu — kart
            container'ı 300px'in altına düşünce (ör. bir bölümün içinde yan yana 2'li KPI ızgarası)
            değer kutusuna 120px'ten az yer kalıp NumberFlow (shadow DOM, `truncate` ellipsis basamıyor)
            SESSİZCE kırpılıyordu ("₺689.442.211" → "₺689.442.2"). `truncate` NumberFlow için gerçek bir
            kırpma koruması değil; asıl koruma sparkline'ı dar container'da hiç göstermemek — container
            query (`@container` + `@min-[300px]`), viewport genişliğinden BAĞIMSIZ olarak KARTIN kendi
            render genişliğini ölçer (bir grid hücresi 1440px ekranda da 4K ekranda da aynı 262px kalabilir,
            viewport breakpoint'i bu durumu yakalayamaz). */}
        {sparkline?.length ? (
          <div className="hidden shrink-0 @min-[300px]:block">
            <Sparkline data={sparkline} tone={good === false ? 'danger' : good === true ? 'success' : 'muted'} className="mb-0.5" />
          </div>
        ) : null}
      </div>
    </>
  );

  const cls = cn(
    'group relative block text-left',
    isStrip
      ? [
          // Mobil: kendi küçük kartı (152×72 — 140'ta uzun başlıklar aşırı kırpılıyordu, Tur 4 P1),
          // yatay kaydırma şeridinde snap-start.
          'h-[72px] w-[152px] shrink-0 snap-start rounded-lg border border-border/70 bg-card px-3 py-2',
          // Masaüstü: çerçevesiz/gölgesiz taban + SOL kenarlıkla dikey hairline (`divide-x` kaldırıldı —
          // `md:border-0` onu her zaman sıfırlıyordu, ikisi aynı anda tanımlıyken kazanan üretilen
          // CSS'in kaynak sırasına bağlıydı ve pratikte hiç ayraç görünmüyordu, Tur 4 P1 bulgusu).
          // İlk kart kenarlıksız (`md:first:border-l-0`).
          'md:h-20 md:w-auto md:snap-align-none md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:border-border/60 md:first:border-l-0 md:bg-transparent md:px-4 md:py-3',
          // `stripCompact`: 3 ya da daha az kart — sabit min genişlik, esnek büyümez (aksi halde
          // birkaç kart 1600px şeride yayılır). Aksi halde eskisi gibi `flex-1`.
          stripCompact ? 'md:min-w-[196px] md:shrink-0 md:flex-none md:grow-0' : 'md:flex-1 md:shrink',
        ]
      : '@container rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.03)]',
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

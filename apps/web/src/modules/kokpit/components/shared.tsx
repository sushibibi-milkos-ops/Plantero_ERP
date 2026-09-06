import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { StatusBadge } from '@/components/status-badge';
import type { CockpitTodayItem } from '../queries';

/** Kokpit'in tüm rol panolarının paylaştığı kart iskeleti: başlık + opsiyonel "Tümü" bağlantısı. */
export function Section({ title, href, children, className }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card', className)}>
      <header className="flex h-11 items-center justify-between border-b border-border/60 px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {href ? (
          // max-md:min-h-11: mobil dokunma hedefi 44px.
          <Link href={href} className="inline-flex items-center gap-1 max-md:min-h-11 text-xs text-muted-foreground hover:text-foreground">
            Tümü <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Tıklanabilir liste satırı — tüm panolardaki "Bugün/SKT/Onay/..." listeleri aynı hover/odak/dokunma dilini paylaşır.
 *  Kök neden (Tur 1 P1 kokpit-rowlink-padding-01): taban sınıf eskiden `sm:py-0` taşıyordu — yükseklik
 *  zaten `sm:h-11` ile sabitlendiği için bu, tüketicinin kendi `sm:py-*` override'ını (aynı özgüllükte,
 *  üretilen CSS'te KAYNAK SIRASINA bağlı olarak) sessizce ezebiliyordu: üretim şefi panosundaki
 *  "Hat durumu" satırları (`sm:h-auto` + yalnızca `py-3`, `sm:py-*` YOK) bu yüzden masaüstünde 0px dikey
 *  boşlukla basılıyordu, GM panosundaki BİREBİR AYNI liste ise (`sm:py-2.5` ile) şans eseri doğru
 *  görünüyordu — aynı bileşen, iki farklı sonuç. `sm:py-0` kaldırıldı: `h-11` (border-box) zaten
 *  toplam yüksekliği sabitliyor, `py-2.5`'lik varsayılan dikey boşluk STANDART tek satırlık listelerde
 *  (13px metin + 2×10px padding ≈ 33px < 44px) hiçbir taşmaya yol açmıyor — güvenli.
 *  `max-sm:min-h-11`: mobilde (<640px) her satır en az 44px dokunma hedefi (Tur 1 P1
 *  kokpit-line-touch-01) — tek satırlık "boşta" satırlar önceden 40px'e düşüyordu. */
export function RowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex max-sm:min-h-11 flex-col gap-1 px-4 py-2.5 text-[13px] outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:h-11 sm:flex-row sm:items-center sm:gap-3',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** İnce ilerleme çubuğu (break-even, OEE, iş emri yüzdesi) — TEK bir değerin hedefe oranını gösterir. */
export function ProgressBar({ pct, tone = 'primary' }: { pct: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const toneClass = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive' }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', toneClass)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/**
 * Yatay sıralama/karşılaştırma çubuğu (kanal ciro, satış hunisi) — `ProgressBar`'dan KASITLI olarak
 * ayrı bir bileşen: `ProgressBar` tek bir değerin %100'e oranını taşır (hedefe uzaklık anlamı), bu ise
 * BİRDEN ÇOK öğeyi birbirine göre sıralar (en yükseğe oranla). Tek ölçülü sıralama grafiklerinde
 * (dataviz skill "form heuristic") kategorik renk gerekmez — TEK bir vurgu rengi, en yüksek çubuk tam
 * doygun, diğerleri aynı ailenin soluk tonu (Tur 1 P1 kokpit-channelbar-hue-01/kokpit-bar-anatomy-01:
 * önceden kanal çubuğu 20px+mavi ikinci renk, huni çubuğu 8px+farklı opaklık — aynı ekranda iki farklı
 * çubuk anatomisi ve iki hue). `strong=true` yalnızca en yüksek/vurgulanan öğede kullanılır. */
export function RankBar({ pct, strong = false }: { pct: number; strong?: boolean }) {
  const clamped = Math.max(2, Math.min(100, pct));
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', strong ? 'bg-primary' : 'bg-primary/45')} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** İki sütunlu (masaüstü) / tek sütunlu (mobil) pano ızgarası — tüm rol panoları bunu kullanır. */
export function DashboardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mt-4 grid gap-4 lg:grid-cols-2 lg:items-start', className)}>{children}</div>;
}

/**
 * Mini istatistik şeridi — kokpit'teki TÜM "birkaç sayıyı yan yana göster" blokları (SKT kovaları,
 * geciken alacak yaşlandırması, onay kuyruğu, KDV pozisyonu, nakit projeksiyonu) bunu kullanır.
 * Kök neden (Tur 1 P1 kokpit-ministrip-consistency-01/kokpit-skt-strip-drift-01/kokpit-kdv-divider-01):
 * bu beş blok beş farklı anatomiyle (13-17px değer, px-2 py-2.5 / py-3, divide-x / gap-px bg-border /
 * hiç ayraç) elle kopyalanmıştı — aynı bilgi tipi farklı panolarda farklı görünüyordu. Tek anatomi:
 * değer 15px/600 tabular-nums, etiket 10px muted, hücre px-2 py-2.5, `divide-x divide-border/60`.
 */
export type StatStripItem = {
  key: string;
  /** Değerin ÜSTÜNDEKİ küçük muted satır (ör. nakit projeksiyonunda ay adı). */
  top?: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
  href?: string;
  valueClassName?: string;
};

export function StatStrip({ items, className, divider = true }: { items: StatStripItem[]; className?: string; divider?: boolean }) {
  return (
    <div
      className={cn('grid', divider && 'divide-x divide-border/60', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => {
        const inner = (
          <>
            {it.top ? <div className="truncate text-[10px] text-muted-foreground">{it.top}</div> : null}
            <div className={cn('text-[15px] font-semibold tabular-nums', it.top && 'mt-0.5', it.valueClassName)}>{it.value}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{it.label}</div>
          </>
        );
        return it.href ? (
          <Link key={it.key} href={it.href} className="px-2 py-2.5 text-center hover:bg-muted/40">
            {inner}
          </Link>
        ) : (
          <div key={it.key} className="px-2 py-2.5 text-center">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export const EXPIRY_BUCKET_LABEL: Record<string, string> = { expired: 'Süresi geçti', critical: '< 30 gün', warning: '30-60 gün', notice: '60-90 gün' };
const EXPIRY_BUCKET_ORDER = ['expired', 'critical', 'warning', 'notice'] as const;

/** SKT kova şeridi — GM ve depo panosu aynı `totals` şeklini birebir aynı anatomiyle basar
 *  (bkz. `StatStrip` doc yorumu — Tur 1 P1 kokpit-skt-strip-drift-01). */
export function ExpiryBucketStrip({ totals, className }: { totals: Record<(typeof EXPIRY_BUCKET_ORDER)[number], { count: number }>; className?: string }) {
  return (
    <StatStrip
      className={cn('border-b border-border/60', className)}
      items={EXPIRY_BUCKET_ORDER.map((b) => ({ key: b, value: totals[b].count, label: EXPIRY_BUCKET_LABEL[b] }))}
    />
  );
}

/** Geciken alacak yaşlandırma şeridi — GM, depo ve muhasebe panosu bunu paylaşır. */
export function AgingStrip({ aging, className }: { aging: { b0_30: string; b31_60: string; b61_90: string; b90plus: string }; className?: string }) {
  return (
    <StatStrip
      className={cn('border-b border-border/60', className)}
      items={[
        { key: '0-30', value: formatMoney(aging.b0_30, 'TRY', { digits: 0 }), label: '0-30 gün' },
        { key: '31-60', value: formatMoney(aging.b31_60, 'TRY', { digits: 0 }), label: '31-60 gün' },
        { key: '61-90', value: formatMoney(aging.b61_90, 'TRY', { digits: 0 }), label: '61-90 gün' },
        { key: '90+', value: formatMoney(aging.b90plus, 'TRY', { digits: 0 }), label: '90+ gün' },
      ]}
    />
  );
}

/**
 * "Geciken alacak" en büyük 5 fatura listesi — GM ve muhasebe panosu birebir aynı satırı kullanırdı
 * (kopyalanmış kod); mobilde üç satıra kırılıyordu: partner / "N gün" / tutar (tutar tek başına bir
 * satır, gün bilgisiyle hizası kopuk — Tur 1 P1 kokpit-fin-mobile-row-01). Gün + tutar artık AYNI
 * ikinci satırda (`sm:contents` ile masaüstünde tek satıra düzleşir) — mobil kart 84px'ten ~60px'e iner.
 */
export function OverdueTop5List({ items, href }: { items: { id: string; partnerName: string; daysOverdue: number; residual: string }[]; href: string }) {
  return (
    <ul className="divide-y divide-border/50">
      {items.map((inv) => (
        <li key={inv.id}>
          <RowLink href={href}>
            <span className="min-w-0 flex-1 truncate">{inv.partnerName}</span>
            <span className="flex shrink-0 items-center justify-between gap-3 sm:contents">
              <span className="text-xs text-muted-foreground">{inv.daysOverdue} gün</span>
              <MoneyCell value={inv.residual} />
            </span>
          </RowLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * Break-even'a uzaklık paneli — GM ve muhasebe panosu aynı bölümü iki farklı etiket setiyle kopyalamıştı
 * ("Bu ay gereken" vs "Bu ay gereken (KDV hariç)" vb. — Tur 1 P2 kokpit-breakeven-label-drift-01).
 * Artık tek kod, tek metin seti.
 */
export function BreakEvenPanel({ breakEven }: { breakEven: { targetRevenue: string; actualNetRevenue: string; progressPct: string; daysRemaining: number; dailyPaceNeeded: string } }) {
  const pct = Number(breakEven.progressPct);
  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">Bu ay gereken (KDV hariç)</span>
        <MoneyCell value={breakEven.targetRevenue} className="text-sm font-medium" />
      </div>
      <div className="mt-1 flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">Gerçekleşen net ciro</span>
        <MoneyCell value={breakEven.actualNetRevenue} className="text-sm font-medium" />
      </div>
      <div className="mt-3">
        <ProgressBar pct={pct} tone={pct >= 100 ? 'success' : 'primary'} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>%{pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} tamamlandı</span>
        <span>{breakEven.daysRemaining} gün kaldı · günlük {formatMoney(breakEven.dailyPaceNeeded, 'TRY', { digits: 0 })} gerekiyor</span>
      </div>
    </div>
  );
}

/**
 * "Bugün" belge akışı satır içeriği — GM ve depo panosu aynı `CockpitTodayItem` listesini render eder.
 * Kök neden (Tur 1 P1 kokpit-depo-mobile-card-01): depo kendi kopyasında iki alt grubu (kind+no+rozet,
 * partner+tutar) `sm:contents` sarmalayıcısı OLMADAN doğrudan `RowLink`'in (mobilde `flex-col`) altına
 * koyuyordu — 4 ayrı satıra düşüp 108-109px'e çıkıyordu; GM'nin (doğru) versiyonu iki gruplu olduğu
 * için mobilde 2 satıra (~65px) iniyordu. Artık TEK render fonksiyonu — ikisi de aynı 2 satırlı mobil
 * anatomiyi paylaşır. */
export function TodayRow({ item }: { item: CockpitTodayItem }) {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
        <span className="flex min-w-0 items-center gap-2 sm:contents">
          <span className="shrink-0 text-xs text-muted-foreground sm:w-20">{item.kind}</span>
          <span className="truncate font-mono text-xs sm:w-36 sm:shrink-0">{item.no}</span>
        </span>
        <span className="shrink-0 sm:order-last">
          <StatusBadge status={item.status} kind={item.k} />
        </span>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
        <span className="min-w-0 flex-1 truncate">{item.partner}</span>
        <span className="shrink-0">{item.amount !== undefined ? <MoneyCell value={item.amount} /> : <QtyCell value={item.qty ?? '0'} uom={item.uom} />}</span>
      </div>
    </>
  );
}

/**
 * Üretim hattı satırı — GM'nin "Üretim hatları" ve üretim şefinin "Hat durumu" listesi aynı veriyi
 * (`LineStatus`) iki farklı elle yazılmış satırla basıyordu: farklı padding (10px vs 0px — RowLink
 * `sm:py-0` bugu, ayrıca düzeltildi), farklı alt satır içeriği (yalnızca docNo vs docNo·productName)
 * (Tur 1 P1 kokpit-line-list-drift-01). Artık tek satır — GM'nin daha ayrıntılı alt satırını
 * (docNo · productName) ikisi de kullanır; `max-sm:min-h-11` boştaki satırların da 44px altına
 * düşmemesini garantiler (Tur 1 P1 kokpit-line-touch-01).
 */
export function ProductionLineRow({ line, href }: {
  line: {
    lineId: string; name: string; lateCount: number; openCount: number;
    current: { status: string; docNo: string; productName: string; plannedQty: string; producedQty: string } | null;
  };
  href: string;
}) {
  const planned = Number(line.current?.plannedQty ?? 0);
  const produced = Number(line.current?.producedQty ?? 0);
  const pct = line.current && planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;
  return (
    <RowLink href={href} className="flex-col items-stretch py-2.5 sm:h-auto sm:flex-col sm:items-stretch sm:py-2.5">
      <div className="flex items-center justify-between">
        <span className="font-medium">{line.name}</span>
        <span className="flex items-center gap-2">
          {line.lateCount > 0 ? <StatusBadge status="late" label={`${line.lateCount} gecikmiş`} tone="danger" /> : null}
          {line.current ? <StatusBadge status={line.current.status} kind="work_order" /> : <StatusBadge status="idle" label="Boşta" tone="muted" />}
        </span>
      </div>
      {line.current && pct > 0 ? (
        <>
          <div className="mt-1.5"><ProgressBar pct={pct} /></div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span className="min-w-0 truncate font-mono">{line.current.docNo} · {line.current.productName}</span>
            <span className="shrink-0 tabular-nums">%{pct}</span>
          </div>
        </>
      ) : line.current ? (
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate font-mono">{line.current.docNo} · {line.current.productName}</span>
          <span className="shrink-0">{line.openCount} açık iş emri</span>
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-muted-foreground">Şu an açık iş emri yok</div>
      )}
    </RowLink>
  );
}

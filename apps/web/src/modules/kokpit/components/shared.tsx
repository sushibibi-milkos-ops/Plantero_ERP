import Link from 'next/link';
import { ArrowRight, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { StatusBadge } from '@/components/status-badge';
import type { CockpitTodayItem } from '../queries';

/** Kokpit'in tüm rol panolarının paylaştığı kart iskeleti: başlık + opsiyonel "Tümü" bağlantısı.
 *  `@container` (Tur 3 P1 kokpit-bugun-partner-trunc-01): `TodayRow` aynı bileşeni FARKLI genişlikteki
 *  kolonlarda render eder (admin/GM'de 568px dar kolon, depo'da `lg:col-span-2` 1152px geniş şerit) —
 *  doğru anatomi (2 satır mı, tek satır mı) VIEWPORT'a değil bu Section'ın KENDİ genişliğine bağlı.
 *  `@container` konteks kurar, `TodayRow` içindeki `@min-[…]:` varyantları bunu sorgular. */
export function Section({ title, href, children, className }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('@container min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card', className)}>
      <header className="flex h-11 items-center justify-between border-b border-border/60 px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {href ? (
          // max-md:min-h-11: mobil dokunma hedefi 44px.
          <Link
            href={href}
            className="inline-flex items-center gap-1 max-md:min-h-11 text-xs text-muted-foreground hover:text-foreground active:text-foreground/80"
          >
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
 *  kokpit-line-touch-01) — tek satırlık "boşta" satırlar önceden 40px'e düşüyordu.
 *  Kök neden (shell-button-active-state-01, kriter 8): bu satır `hover:bg-muted/40` ve
 *  `focus-visible:bg-muted/40` taşıyordu ama BASMA durumu hiç yoktu — `<Link>` `data-pressable`
 *  taşımadığı için globals.css'teki gövde-genelindeki basma seçicisi de bu satıra uygulanmıyordu.
 *  `active:bg-muted/60` (transform DEĞİL, zemin rengi) eklendi: Button'daki ölçek animasyonundan
 *  kasıtlı olarak farklı — bir satırın klavyeyle (Enter) aktive edilmesi anlık bir zemin koyulaşmasına
 *  yol açsa bile Button'ın `scale()` düzeltmesinin çözdüğü "sıçrama" rahatsızlığını taşımaz.
 *  Kök neden (Tur 3 P1 kokpit-rowheight-01/02): `sm:h-11` (44px) Linear referans bandının (36-40px)
 *  üstündeydi — tüm tek-satırlık listelerde (Karantina, SKT riski, Son siparişler, En çok satan 5, Son
 *  iş emirleri...) masaüstü satırı gereksiz yere şişiriyordu. `sm:h-10` (40px) bandın İÇİNDE; mobil
 *  dokunma hedefi (`max-sm:min-h-11`, 44px) DEĞİŞMEDİ. */
export function RowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex max-sm:min-h-11 flex-col gap-1 px-4 py-2.5 text-[13px] outline-none hover:bg-muted/40 active:bg-muted/60 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:h-10 sm:flex-row sm:items-center sm:gap-3',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** İnce ilerleme çubuğu (break-even, OEE, iş emri yüzdesi) — TEK bir değerin hedefe oranını gösterir.
 *  `className` çağıranın track yüksekliğini ezmesine izin verir (Tur 3 P1 kokpit-rowheight-02:
 *  ProductionLineRow'un masaüstü 2 satırlık anatomisi `h-1.5`'i `sm:h-1`'e indirerek ≤56px hedefine iner). */
export function ProgressBar({ pct, tone = 'primary', className }: { pct: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const toneClass = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive' }[tone];
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}>
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

/** Sayısal (veya para biçimli metin) bir değerin sıfır olup olmadığını belirler — MoneyCell'in
 *  kendi kuralıyla (`getMoneyTone`) AYNI sinyali taşır (Tur 2 P2 kokpit-statstrip-zero-01): StatStrip
 *  hücreleri önceden sıfırı da tam kontrastla basıyordu ("Onay kuyruğu"nda 0/12/0/0 dördü aynı renk),
 *  oysa MoneyCell zaten sıfırı soluk gösteriyordu — aynı ekranda iki farklı sıfır dili. `value` bir
 *  ham sayı (ör. onay sayacı) ya da `formatMoney` çıktısı bir metin (ör. "₺0,00") olabilir; metin
 *  kolonu (ör. "Ağustos 2026" dönem etiketi) yanlışlıkla sıfır sanılmasın diye yalnızca rakam+virgül+
 *  eksi karakterleri süzülüp sayısallaştırılır (binlik nokta ayracı elenir).
 */
function isZeroValue(value: React.ReactNode): boolean {
  if (typeof value === 'number') return value === 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d,-]/g, '');
    if (!cleaned) return false;
    const n = Number(cleaned.replace(',', '.'));
    return Number.isFinite(n) && n === 0;
  }
  return false;
}

/** 4+ öğeli şeritlerde <640px'te tek satıra sığdırmak yerine 2x2'ye kırılır (Tur 2 P1
 *  kokpit-kdv-strip-mobile-01): "KDV pozisyonu" gibi 4 hücreli şeritler 390px'te hücre başına ~85px'e
 *  düşünce etiketlerin yarısı kırpılıyor ve tek satırlık değerler (ör. "Ağustos 2026") ikinci satıra
 *  sarıp hücreyi yükseltiyordu. `sm:` üstünde masaüstündeki tek satırlık `items.length` kolonuna geri
 *  döner (CSS değişkeni `--strip-cols` ile — dinamik kolon sayısı Tailwind'in derleme zamanı sınıf
 *  taramasıyla ifade edilemediği için). 3 ve altı öğede mobilde de zaten sıkışmıyor, kırılım gerekmiyor.
 */
export function StatStrip({ items, className, divider = true }: { items: StatStripItem[]; className?: string; divider?: boolean }) {
  const wraps = items.length >= 4;
  return (
    <div
      className={cn(
        'grid',
        wraps ? 'grid-cols-2 sm:[grid-template-columns:var(--strip-cols)]' : '',
        divider && (wraps ? 'divide-x divide-y divide-border/60 sm:divide-y-0' : 'divide-x divide-border/60'),
        className,
      )}
      style={
        wraps
          ? ({ '--strip-cols': `repeat(${items.length}, minmax(0, 1fr))` } as React.CSSProperties)
          : { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
      }
    >
      {items.map((it) => {
        const zero = it.valueClassName === undefined && isZeroValue(it.value);
        const inner = (
          <>
            {it.top ? <div className="truncate text-[10px] text-muted-foreground">{it.top}</div> : null}
            <div className={cn('text-[15px] font-semibold tabular-nums', it.top && 'mt-0.5', zero && 'text-muted-foreground/70', it.valueClassName)}>{it.value}</div>
            {/* Kök neden (Tur 3 P2 kokpit-fin-strip-label-tabular-01): alttaki `label` yuvası düz metin
                ("0-30 gün") taşıyabildiği gibi Nakit projeksiyonu'nda para metni de taşıyor
                ("kapanış ₺33.278") — bu durumda `tabular-nums` eksikti, 4px üstündeki 15px değer
                tabular olduğu halde üç ayın kapanış basamakları hizalanmıyordu. `tabular-nums`
                koşulsuz eklenir; rakam içermeyen etiketlerde (ör. "0-30 gün") hiçbir görsel etkisi yok. */}
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground tabular-nums">{it.label}</div>
          </>
        );
        return it.href ? (
          <Link key={it.key} href={it.href} className="px-2 py-2.5 text-center hover:bg-muted/40 active:bg-muted/60">
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

/**
 * Banka hesapları listesi — GM ve muhasebe panosu aynı `BankAccountCard[]` listesini render eder.
 * Kök neden (Tur 4 P1 kokpit-fin-row-anatomy-01): bu satır iki panoda AYRI AYRI elle yazılmış
 * `<li className="flex h-11 …">` idi — 44px (kokpitteki diğer TÜM tek satırlık listeler `RowLink`
 * ile 40px) VE href taşımıyordu (tıklanamaz, hover/focus/active geri bildirimi yok) — aynı bilgi
 * sınıfı taşıyan "Geciken alacak" (`OverdueTop5List`, `RowLink`) yanında görsel ve etkileşim olarak
 * ayırt edilemiyordu. Artık `RowLink` — tek anatomi, tek kod, iki pano paylaşıyor.
 */
export function BankAccountsList({
  accounts,
  href,
}: {
  accounts: { id: string; bankName: string; code: string; currency: string; statementBalance: string }[];
  href: string;
}) {
  return (
    <ul className="divide-y divide-border/50">
      {accounts.map((a) => (
        <li key={a.id}>
          <RowLink href={href}>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Wallet className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="min-w-0 truncate">{a.bankName} · {a.code}</span>
            </span>
            <MoneyCell value={a.statementBalance} currency={a.currency} className="shrink-0" />
          </RowLink>
        </li>
      ))}
    </ul>
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
      {/* Kök neden (Tur 2 P2 kokpit-14px-tier-01): bu iki satır `text-sm` (14px) taşıyordu — ekrandaki
          TÜM diğer liste satırları 13px, 1px'lik fark hiçbir anlam taşımadan ayrı bir kademe açıyordu.
          `text-[13px]` ile tek gövde kademesine iner. */}
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted-foreground">Bu ay gereken (KDV hariç)</span>
        <MoneyCell value={breakEven.targetRevenue} className="text-[13px] font-medium" />
      </div>
      <div className="mt-1 flex items-baseline justify-between text-[13px]">
        <span className="text-muted-foreground">Gerçekleşen net ciro</span>
        <MoneyCell value={breakEven.actualNetRevenue} className="text-[13px] font-medium" />
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
 * "Bugün" belge akışı satırı — GM/admin ve depo panosu aynı `CockpitTodayItem` listesini render eder.
 * Kök neden (Tur 1 P1 kokpit-depo-mobile-card-01): depo kendi kopyasında iki alt grubu (kind+no+rozet,
 * partner+tutar) `sm:contents` sarmalayıcısı OLMADAN doğrudan `RowLink`'in (mobilde `flex-col`) altına
 * koyuyordu — 4 ayrı satıra düşüp 108-109px'e çıkıyordu; GM'nin (doğru) versiyonu iki gruplu olduğu
 * için mobilde 2 satıra (~65px) iniyordu.
 *
 * Kök neden (Tur 3 P1 kokpit-bugun-partner-trunc-01 + kokpit-numcol-ragged-01/02): masaüstünde bu iki
 * grup `sm:contents` ile TEK satıra düzleşiyordu (kind, no, partner, tutar, rozet — 5 öğe aynı flex
 * satırında). Bunun iki sonucu vardı: (a) dar kolonlarda (568px, admin "Bugün" — GM panosunda bu bölüm
 * HER ZAMAN 2 kolonlu ızgaranın SOL yarısı, asla tam genişlik değil) partner'a yalnızca kalan boşluk
 * (~94-104px) kalıyordu — gerçek içerik 242-331px, 8 satırın 6'sı kırpılıyordu; AYNI bileşen depo'nun
 * `lg:col-span-2` (1152px) "Bugün" şeridinde kırpmıyordu çünkü orada kalan boşluk yeterliydi — kusur
 * "kalan boşluktan" hesaplanan, GENİŞLİĞE göre iki farklı sonuç veren bir sütun payıydı. (b) tutar her
 * zaman rozetin SOLUNA düşüyordu (`order-last` rozetten SONRA gelen tek öğe tutardı) — rozet metni
 * satırdan satıra uzunluk değiştirdikçe (ör. "Tamamlandı" 90px vs "Kalite bekliyor" 120px) tutarın sağ
 * kenarı 17px'e kadar kayıyordu; bu kusur HER İKİ genişlikte de vardı (rozet konumu genişlikten
 * bağımsızdı).
 *
 * Düzeltme genişliğe göre İKİ AYRI (ama aynı fonksiyonda tutulan) anatomi kullanır — `@container`
 * (Section'da tanımlı) ile bu Section'ın KENDİ genişliğini sorgular, VIEWPORT'u değil:
 *  - Dar konteyner (<700px — admin/GM'nin 568px'lik "Bugün" kolonu VE her genişlikte mobil): mobil
 *    anatomisiyle BİREBİR aynı 2 satır (satır 1: kind+no+rozet, satır 2: partner+tutar). Rozet artık
 *    partnerle/tutarla AYNI satırda değil — hiçbir şeyi kaydırmıyor; partner'a kalan genişlik 3-4 kata
 *    çıkıyor (kind+no ayrı bir satırda).
 *  - Geniş konteyner (≥700px — depo'nun 1152px'lik "Bugün" şeridi): TEK satır KORUNUR (Tur 3 P1
 *    kokpit-rowheight-01: depo rotasında TÜM satırların medyanı ölçülüyor — "Bugün" 2 satıra dönerse
 *    Karantina/SKT'nin 40px'lik satırlarını sayıca geçip medyanı 56px'e çıkarır, ≤40px hedefini
 *    bozardı). Tutar VE rozet artık SABİT genişlikli yuvalarda (`w-24`/`w-32`, sağa yaslı) — tutarın
 *    sağ kenarı artık rozetin GERÇEK metin genişliğine değil SABİT yuva genişliğine bağlı, bu yüzden
 *    satırdan satıra kaymıyor (±0px).
 * İki blok da DOM'da var, yalnızca biri `hidden`/`flex` ile açılır — tek bir elemanın çelişen
 * (aynı özgüllükte, kaynak sırasına bağlı) genişlik/yükseklik sınıflarıyla "yeniden şekillendirilmesi"
 * yerine (RowLink `sm:py-0` bugunun ders çıkarılmış hâli, bkz. `RowLink` doc yorumu) HER blok kendi
 * boyutunu taşır — geçiş belirsizliğe (hangi kural kazanacağına dair CSS kaynak-sırası varsayımına)
 * bağlı değildir. */
export function TodayRow({ item }: { item: CockpitTodayItem }) {
  // Kök neden (Tur 3 P1 kokpit-numcol-ragged-02, ikinci katman): geniş-konteyner bloğunda tutarı SABİT
  // genişlikli bir `<span className="w-24">` İÇİNE koymak tek başına YETMİYORDU — `MoneyCell` kendisi
  // `inline-block` (içeriği kadar dar) olduğundan, sarmalayıcının genişliği sabit olsa bile MoneyCell
  // kendi içeriği kadar dar kalıp sarmalayıcının SOL kenarına yaslanıyordu (`text-right` yalnızca KENDİ
  // kutusu içindeki metni hizalar, kutuyu değil) — sağ kenar yine tutar basamak sayısına göre kayıyordu.
  // Genişlik doğrudan hücrenin KENDİSİNE verilir (aracı `<span>` yok) — artık kutu gerçekten sabit ve
  // `text-right`/`justify-end` o kutunun İÇİNDE doğru kenara hizalar.
  const money = (w?: string) => (item.amount !== undefined ? <MoneyCell value={item.amount} className={w} /> : <QtyCell value={item.qty ?? '0'} uom={item.uom} className={w} />);
  return (
    <RowLink href={item.href} className="px-0 py-0 sm:h-auto sm:flex-col sm:items-stretch sm:gap-0 sm:px-0 sm:py-0">
      {/* Dar konteyner + mobil: 2 satır. */}
      <div className="flex flex-col gap-0.5 px-4 py-2.5 @min-[700px]:hidden sm:py-2">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 truncate text-xs text-muted-foreground">{item.kind}</span>
            <span className="shrink-0 truncate font-mono text-xs">{item.no}</span>
          </span>
          <span className="shrink-0">
            <StatusBadge status={item.status} kind={item.k} />
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate">{item.partner}</span>
          <span className="shrink-0">{money()}</span>
        </div>
      </div>
      {/* Geniş konteyner (depo'nun col-span-2 "Bugün" şeridi): tek satır, tutar/rozet sabit yuvalarda. */}
      <div className="hidden h-10 min-w-0 items-center gap-3 px-4 @min-[700px]:flex">
        <span className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{item.kind}</span>
          <span className="w-32 shrink-0 truncate font-mono text-xs">{item.no}</span>
        </span>
        <span className="min-w-0 flex-1 truncate">{item.partner}</span>
        {money('w-24 shrink-0')}
        <span className="flex w-32 shrink-0 justify-end">
          <StatusBadge status={item.status} kind={item.k} />
        </span>
      </div>
    </RowLink>
  );
}

/**
 * Üretim hattı satırı — GM'nin "Üretim hatları" ve üretim şefinin "Hat durumu" listesi aynı veriyi
 * (`LineStatus`) iki farklı elle yazılmış satırla basıyordu: farklı padding (10px vs 0px — RowLink
 * `sm:py-0` bugu, ayrıca düzeltildi), farklı alt satır içeriği (yalnızca docNo vs docNo·productName)
 * (Tur 1 P1 kokpit-line-list-drift-01). Artık tek satır — GM'nin daha ayrıntılı alt satırını
 * (docNo · productName) ikisi de kullanır; `max-sm:min-h-11` boştaki satırların da 44px altına
 * düşmemesini garantiler (Tur 1 P1 kokpit-line-touch-01).
 *
 * Kök neden (Tur 3 P1 kokpit-rowheight-02): bu satır 3 alt satır taşıdığı (başlık+rozet, ilerleme
 * çubuğu, meta) için tek-satırlık listelerin ≤40px hedefine giremez — puan kartı bunu bilerek AYRI bir
 * bantla ölçer ("iki/çok satırlık satır ≤56px"). Masaüstü ölçümü 72.5-73.5px'ti (mobildeki `py-2.5` +
 * `mt-1.5`/`mt-1` boşlukları + `h-1.5` çubuk masaüstünde de aynen kullanılıyordu). Yalnızca masaüstü
 * (`sm:`) daraltıldı — mobil (390px, dokunma hedefi + okunabilirlik) DEĞİŞMEDİ: `sm:py-1.5`,
 * `sm:mt-1`/`sm:mt-0.5`, çubuk `sm:h-1`. Toplam ~56px'e iner. */
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
    <RowLink href={href} className="flex-col items-stretch py-2.5 sm:h-auto sm:flex-col sm:items-stretch sm:gap-0.5 sm:py-1.5">
      <div className="flex items-center justify-between">
        <span className="font-medium">{line.name}</span>
        <span className="flex items-center gap-2">
          {line.lateCount > 0 ? <StatusBadge status="late" label={`${line.lateCount} gecikmiş`} tone="danger" /> : null}
          {line.current ? <StatusBadge status={line.current.status} kind="work_order" /> : <StatusBadge status="idle" label="Boşta" tone="muted" />}
        </span>
      </div>
      {line.current && pct > 0 ? (
        <>
          <div className="mt-1.5 sm:mt-1"><ProgressBar pct={pct} className="sm:h-1" /></div>
          {/* Kök neden (Tur 2 P1 kokpit-line-row-collision-01): `justify-between`'de `gap` tanımlı
              değildi — 390px'te kısılan belge no/ürün adı metni ile sağdaki yüzde/sayı arasında 0px
              boşluk kalıp tek bozuk dizge gibi okunuyordu. `gap-3` en az 12px'i garantiler; flex öğesi
              gerekirse bu payı bırakacak kadar daha fazla küçülür (taşma değil). */}
          <div className="mt-1 flex justify-between gap-3 text-[11px] text-muted-foreground sm:mt-0.5">
            <span className="min-w-0 truncate font-mono">{line.current.docNo} · {line.current.productName}</span>
            <span className="shrink-0 tabular-nums">%{pct}</span>
          </div>
        </>
      ) : line.current ? (
        <div className="mt-1 flex justify-between gap-3 text-[11px] text-muted-foreground sm:mt-0.5">
          <span className="min-w-0 truncate font-mono">{line.current.docNo} · {line.current.productName}</span>
          <span className="shrink-0">{line.openCount} açık iş emri</span>
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-muted-foreground sm:mt-0.5">Şu an açık iş emri yok</div>
      )}
    </RowLink>
  );
}

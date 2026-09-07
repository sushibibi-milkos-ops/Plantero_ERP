/**
 * Tur 9 kokpit puan kartı güncellemesi (docs/DESIGN-SCORECARD.md).
 *   tsx scripts/critic-kokpit-r9-update.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Finding = Record<string, unknown>;
type Route = { round: number; scores: number[]; total: number; reference: string; scoreNotes?: string; open: Finding[]; closed: Finding[] };
type Card = { module: string; round: number; note: string; routes: Record<string, Route> };

const path = resolve(process.cwd(), 'artifacts', 'critic', 'kokpit.json');
const card = JSON.parse(readFileSync(path, 'utf8')) as Card;

const SCORES = [5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5];
const TOTAL = SCORES.reduce((a, b) => a + b, 0); // 59

const LOADING: Finding = {
  id: 'kokpit-loading-skeleton-mismatch-09',
  criterion: 7,
  severity: 'P1',
  openedRound: 9,
  supersedes: 'kokpit-loading-strip-frame-07',
  text:
    'Rota iskeleti (kokpit/loading.tsx) gerçek sayfanın anatomisini TAŞIMIYOR; yükleme bitince görünür bir düzen sıçraması oluyor. ' +
    '(a) MASAÜSTÜ: iskelet KPI şeridi ÇERÇEVELİ bir kutu (1px border + 8px radius + divide-x/divide-y) ve 66px; gerçek şerit çerçevesiz/şeffaf, ' +
    '80px ve yalnızca kartlar arası SOL hairline taşıyor — yükleme bitince bir çerçeve "sönüyor" ve şerit 14px büyüyor. ' +
    '(b) MOBİL (390px): iskelet 2×2 çerçeveli ızgara, 132px; gerçek şerit ise 4 adet 152×72px kartın YATAY KAYDIRAN (snap) şeridi, ~76px — ' +
    'yani iskelet mobilde bambaşka bir bileşen çiziyor ve 56px fazla yer kaplıyor. ' +
    '(c) İskelet liste satırı h-11 (44px); gerçek satır masaüstünde sm:h-10 (40px), mobilde 62,5–65,5px — mobilde satır başına 19–21px hata, ' +
    '~18 satırda ~400px eksik yükseklik vaadi. Dosyanın kendi yorum bloğu "KpiStripRow ile aynı anatomi: çerçevesiz, masaüstünde dikey hairline" ' +
    'diyor; kod bunun tersini yapıyor (rounded-lg border). NOT: sert gezinmede (adres çubuğu/ilk yükleme) yalnızca (app)/loading.tsx görünüyor, ' +
    'rota iskeleti yumuşak gezinmede (prefetch dolmamışken) basılıyor — probe r9f bunu prefetch geciktirerek yakaladı.',
  measure:
    'probe-r9f.json → soft-1440 strip: cls "mb-6 grid grid-cols-2 divide-x divide-y … rounded-lg border border-border/60 sm:grid-cols-4", ' +
    'borderTopWidth 1px, radius 8px, h 66, childH [64,64,64,64]; soft-390 strip: gridCols "178px 178px", h 132, childH [65,65,65,65]; ' +
    'flexRowHeights her iki viewport\'ta 44. Gerçek sayfa: kpi-card.tsx "md:h-20 … md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:bg-transparent" ' +
    '+ mobil "h-[72px] w-[152px]", kpi-strip.tsx "flex gap-2 overflow-x-auto snap-x"; shared.tsx ROW_BASE "sm:h-10"; ' +
    'measure-kokpit-r9/*-390.json rows.heights medyan 63,5–65,5.',
  target:
    'İskelet KPI şeridi = KpiStripRow anatomisi: masaüstünde dış çerçevesiz/şeffaf + kartlar arası yalnızca sol hairline, kart yüksekliği 80px; ' +
    'mobilde çerçeveli 2×2 ızgara yerine 4×(152×72px) yatay kaydıran şerit (toplam ≤80px). İskelet liste satırı masaüstünde 40px (h-10), ' +
    'mobilde 62–66px. Kabul: soft-nav iskeleti ile yüklenmiş sayfa arasında KPI şeridi yüksekliği farkı ≤4px ve satır yüksekliği farkı ≤4px, ' +
    'iskelette dış çerçeve/radius yok.',
  file: 'apps/web/src/app/(app)/kokpit/loading.tsx:24 (KPI şeridi), :42 (liste satırı h-11)',
  shot: 'artifacts/critic/measure-kokpit-r9/soft-skeleton-1440.png, soft-skeleton-390.png',
};

const ACTIVITY: Finding = {
  id: 'kokpit-activity-dupe-06',
  criterion: 12,
  severity: 'P2',
  openedRound: 8,
  text:
    '"Son aktiviteler" listesinde ardışık OLMAYAN aynı (kullanıcı, özet) çifti ikinci kez ayrı satır olarak basılıyor: 8 satırın 2\'si bayt-bayt aynı. ' +
    'Ayrıca 8/8 satır aynı göreli zaman etiketini taşıdığı için okuyucu iki satırı hiçbir alandan ayırt edemiyor. ' +
    'Kök neden: groupConsecutiveActivity yalnızca ARDIŞIK tekrarları katlıyor.',
  measure:
    'Tur 9 yeniden ölçüm — probe-r9.json admin-1440 §"Son aktiviteler": rowCount 8, dupes 1 çift ' +
    '("Satış Sorumlusu · satis@plantero.local giriş yaptı" + "2 dakika önce" iki kez), distinctTexts 7/8; ' +
    'probe-r9.json digitNonTabSample admin → "2 dakika önce" 8 satırın 7\'sinde aynı.',
  target: 'Aynı bölümde 0 bayt-bayt aynı satır — ardışık olmayan aynı (kullanıcı, özet) çiftleri de katlansın ya da göreli etiket tekrar ettiğinde saat (HH:mm) basılsın.',
  file: 'packages/core/src/cockpit/kpis.ts:277 (groupConsecutiveActivity) + apps/web/src/modules/kokpit/components/gm-dashboard.tsx:148-165',
};

const META_TABULAR: Finding = {
  id: 'kokpit-meta-tabular-08',
  criterion: 6,
  severity: 'P2',
  openedRound: 8,
  text:
    'Para/miktar değerlerinin tamamı tabular-nums (.num düğümlerinde 0 istisna); ancak İKİNCİL sayısal metinler değil: tarih sütunu (07.09.2026), ' +
    'süre/gecikme metaları (45 dk, 16 gün), sıra numaraları (1..5), dönem etiketleri (Eylül 2026). Ölçülebilir bir hizalama sapması üretmiyor ' +
    '(rightSpread 0), bu yüzden kriter 6 puanı düşürülmedi — yine de kriterin harfi tabular-nums istiyor.',
  measure:
    'Tur 9 yeniden ölçüm — probe-r9.json digitNonTab (mono hariç): admin 18, satis 18, muhasebe 11, uretim_sefi 9, depo 2; ' +
    'numNonTab (.num düğümleri) 5 rolde de 0; tüm bölümlerde rightSpread 0.',
  target: 'main içindeki rakam taşıyan tüm görünür metin düğümlerinde font-variant-numeric: tabular-nums (mono belge numaraları hariç) → digitNonTab 0.',
  file: 'apps/web/src/modules/kokpit/components/sales-dashboard.tsx (tarih/sıra sütunu), production-chief-dashboard.tsx (dk), shared.tsx OverdueTop5List (gün), finance-dashboard.tsx (dönem)',
};

const CLOSE_NOTE = {
  id: 'kokpit-loading-strip-frame-07',
  closedRound: 9,
  verifiedBy: 'yerine geçti: kokpit-loading-skeleton-mismatch-09 (aynı kök neden, mobil kanıtla P2→P1 yükseltildi)',
};

const SCORE_NOTES =
  'Tur 9 deltası — kriter 7: 5→4. Gerekçe: rota iskeleti ilk kez YAKALANIP ölçüldü (probe-r9f, prefetch geciktirilerek). ' +
  'Tur 8 yalnızca kodu okuyup masaüstü çerçeve + 4px satır farkını P2 saymıştı; Tur 9 ölçümü mobilde iskeletin BAŞKA bir bileşen ' +
  '(132px 2×2 çerçeveli ızgara vs ~76px yatay kaydıran şerit) çizdiğini ve satır başına 19–21px hata yaptığını gösterdi → P1. ' +
  'Diğer 11 kriter yeniden ölçüldü ve 5\'te kaldı: taşma yok (scrollWidth = clientWidth, 10/10 kesit), satır 40–41px masaüstü / 60–65,5px mobil, ' +
  'katlama üstü bilgi birimi 19/26/24/25/19 (≥15), .num düğümlerinde tabular-nums 100%, sıfır değerler soluk ' +
  '(oklab(0.552 … / 0.7)) hem KPI hem StatStrip\'te, mobilde 44px altı dokunma hedefi 0, h1 24px/600 masaüstü + 20px/600 mobil, ' +
  'gövde 13px baskın. Kod düzeyi tarama temiz: transition:all / ease-in / scale(0) / ≥300ms YOK; hover globals.css:10 ' +
  '@custom-variant ile (hover:hover) and (pointer:fine) kapısından geçiyor; :active scale(0.97) 140ms, :not(:focus-visible) korumalı. ' +
  'Ekran görüntülerindeki sol-alt siyah "N" rozeti Next.js dev overlay\'i (probe-r9b devOverlay=true) — ürün kusuru değil, bulgu açılmadı.';

for (const key of Object.keys(card.routes)) {
  const r = card.routes[key]!;
  r.closed = [...(r.closed ?? []), CLOSE_NOTE];
  r.round = 9;
  r.scores = [...SCORES];
  r.total = TOTAL;
  r.scoreNotes = SCORE_NOTES;
  r.open = key.includes('rol=admin') ? [LOADING, ACTIVITY, META_TABULAR] : [LOADING];
}

card.round = 9;
card.note =
  'Tur 9 (kritik doğrulama, örnekleme Europe/Istanbul 7 Eylül 04:45–05:20). 5 rol kesiti yeniden çekildi ' +
  '(scripts/shot-kokpit-r3.ts, 1440×900 + 390×844 → artifacts/screens/kokpit-<rol>/). Ölçümler: ' +
  'artifacts/critic/measure-kokpit-r9/ — pnpm measure (5 rol × 2 viewport), YENİ scripts/probe-kokpit-r9.ts (bölüm anatomisi, ' +
  'bayt-bayt aynı satır, sağ kenar hizası, tabular kapsaması, kolon dibi dengesi, dokunma hedefleri), probe-kokpit-r9b.ts ' +
  '(sıfır değer soluklaştırma + dev-overlay teyidi), probe-kokpit-r9d/e/f.ts (YÜKLENİYOR İSKELETİNİ gerçekten yakalama), ' +
  'probe-kokpit-r9g.ts (katlama üstü bilgi birimi). ' +
  'TUR 8 AÇIK BULGULARI YENİDEN ÖLÇÜLDÜ: kokpit-activity-dupe-06 AÇIK KALDI (admin "Son aktiviteler" 8 satır, 1 bayt-bayt aynı çift), ' +
  'kokpit-meta-tabular-08 AÇIK KALDI (digitNonTab 18/18/11/9/2), kokpit-loading-strip-frame-07 KAPATILDI ve yerine ' +
  'kokpit-loading-skeleton-mismatch-09 (P1) açıldı — ilk kez iskelet DOM\'u yakalanıp ölçüldü ve mobilde tamamen farklı bir ' +
  'bileşen çizdiği görüldü. ' +
  'ÖNEMLİ ÖLÇÜM NOTU: kokpit/loading.tsx SERT gezinmede hiç görünmüyor (25 sn boyunca yalnızca (app)/loading.tsx yakalandı — ' +
  'probe-r9e); rota iskeleti YUMUŞAK gezinmede, router önbelleği boşken basılıyor (probe-r9f prefetch\'i 6 sn geciktirerek yakaladı). ' +
  'KAZANAN: her 5 kesitte referans (Stripe 56 / Linear 57) — toplam 59 ≥ referans ama açık P1 var, kazanma kuralı sağlanmıyor.';

writeFileSync(path, JSON.stringify(card, null, 1) + '\n');
console.log('kokpit.json güncellendi: round 9, 5 rota, toplam', TOTAL);

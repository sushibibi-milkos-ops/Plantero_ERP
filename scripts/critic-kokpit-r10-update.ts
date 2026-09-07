/**
 * Tur 10 kokpit kritik kartı güncellemesi (docs/DESIGN-SCORECARD.md).
 *   tsx scripts/critic-kokpit-r10-update.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(process.cwd(), 'artifacts', 'critic', 'kokpit.json');
type Finding = Record<string, unknown>;
type Route = { round: number; reference: string; referenceTotal: number; scores: number[]; total: number; verdict: string; shots?: unknown; scoreNotes?: string; open: Finding[]; closed: Finding[] };
const card = JSON.parse(readFileSync(FILE, 'utf8')) as { module: string; round: number; note: string; routes: Record<string, Route> };

const R = 10;

/** Tur 9'da açık kalan/kapatılan bulgular Tur 10'da yeniden ölçüldü. */
const CLOSED_R10: Record<string, Finding[]> = {};

const NOTE_COMMON =
  'Kriter 7: 4→5. Gerekçe: kokpit/loading.tsx iskeleti ilk kez HER İKİ viewport\'ta yakalanıp gerçek sayfayla ' +
  'bire bir karşılaştırıldı (scripts/probe-kokpit-r10b.ts + r10c.ts; yumuşak gezinme, /kokpit isteği 6-12 sn geciktirildi): ' +
  'masaüstü şerit 80px↔80px, kart genişlikleri 287,3/288,3↔287,3/288,3, kart başına border-left "0px,1px,1px,1px"↔aynı, ' +
  'radius 0px↔0px, bölüm kartı radius 12px↔12px, başlık 44px↔44px, satır 40px↔40px; mobil şerit 76↔76, kart 152×72↔152×72, ' +
  'radius 8px↔8px, satır 63px↔62,5-64,5px (±1,5px). Tur 9\'daki P1 (kokpit-loading-skeleton-mismatch-09) ölçümle KAPALI. ' +
  'Boş durumlar ikon+başlık+açıklama+eylem taşıyor (Kritik stok, Bugünün tahsilatları, Fire kırılımı, Hat durumu); hata sınırı (app)/error.tsx mevcut. ' +
  'Kriter 8: 5→4. Gerekçe: gerçek Tab turunda (scripts/probe-kokpit-r10e.ts) main içindeki 40 odak durağının 21\'i uygulamanın ' +
  '2px inset halkasını (RowLink) çiziyor, 18\'i tarayıcı varsayılanı `outline: auto 1px`e düşüyor (4-5 KPI kartı, 10 "Tümü" ' +
  'bağlantısı, 4 StatStrip hücresi) — odak görünür ama tek dil değil. ' +
  'Yeniden ölçülen ve 5\'te kalan kriterler: taşma yok (scrollWidth = clientWidth 10/10 kesit), satır 40-44px masaüstü / ' +
  '59,5-65,5px mobil, katlama üstü bilgi birimi 17/25/30/16/19 (≥15), .num düğümlerinde tabular-nums %100 (tabular olmayan ' +
  'tek düğümler düzyazı cümleler ve ürün adları), sıfır değerler soluk (oklab(0.552 … / 0.7)) hem KPI hem StatStrip\'te, ' +
  'mobilde 44px altı dokunma hedefi 0/42, katlama üstü metin rengi 2-5 (nötr + anlam), bayt-bayt aynı satır 0. ' +
  'Kod düzeyi tarama temiz: kokpit modülünde ve KPI/rozet bileşenlerinde `transition-all`, `ease-in`, `scale(0)`, ≥300ms süre yok; ' +
  'hover globals.css:11\'de `@media (hover: hover) and (pointer: fine)` ile korunuyor; basma ölçeği `:active:not(:focus-visible)` ile klavyeden ayrık.';

const FOCUS_FINDING = (): Finding => ({
  id: 'kokpit-focus-ring-dialect-10',
  criterion: 8,
  severity: 'P2',
  text:
    'Kokpit içinde İKİ farklı odak dili var: liste satırları (RowLink, shared.tsx:77) `focus-visible:ring-2 ring-ring ring-inset` ' +
    'çiziyor; KPI şeridi kartları (kpi-card.tsx `variant="strip"` sarmalayıcı <a>), bölüm başlıklarındaki "Tümü" bağlantıları ' +
    '(shared.tsx Section:24) ve StatStrip hücre bağlantıları (shared.tsx:227) hiçbir focus-visible sınıfı taşımadığı için ' +
    'tarayıcının varsayılan `outline: auto 1px` halkasına düşüyor. Odak görünür (outline-color token rengini alıyor) ama ' +
    'aynı ekranda 1px UA çerçevesi ile 2px iç halka yan yana.',
  measure:
    '1440×900 /kokpit (admin), gerçek Tab turu: main içindeki 40 odak durağının 21\'i boxShadow "0 0 0 2px inset" (ring-2), ' +
    '18\'i outline "1px auto" (4 KPI kartı 288×80, 10 "Tümü" 48×16, 4 StatStrip hücresi 142×60) ' +
    '(artifacts/critic/measure-kokpit-r10/probe-r10e.json)',
  target:
    'Odaklanabilir her kokpit yüzeyi tek dil kullansın: `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` ' +
    '(KpiCard strip sarmalayıcısı, Section "Tümü" bağlantısı, StatStrip hücre bağlantısı) — ölçümde outline "1px auto" sayısı 0, ring-2 sayısı 40/40.',
  file: 'apps/web/src/modules/kokpit/components/shared.tsx (Section "Tümü" + StatStrip hücresi), apps/web/src/components/kpi-card.tsx (strip sarmalayıcı <a>)',
  openedRound: R,
});

const routes = card.routes;

// --- /kokpit?rol=admin
{
  const r = routes['/kokpit?rol=admin']!;
  r.round = R;
  r.scores = [4, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5];
  r.total = r.scores.reduce((a, b) => a + b, 0);
  r.verdict = 'KAZANAN: Stripe (toplam 58 ≥ 56 ama açık P1 var — kazanma kuralı sağlanmıyor)';
  r.open = [
    {
      id: 'kokpit-channel-single-tier-10',
      criterion: 1,
      severity: 'P1',
      text:
        '"Günlük kanal satışları" kartında AYNI sağ hizalı para sütununda üç farklı tipografik kademe var ve alt kırılım ' +
        'kendi özet satırından DAHA yüksek sesle basılıyor. `ChannelBars` (channel-bars.tsx:31-48) tek kanal varken değeri ' +
        '15px/600 ile, iki+ kanal varken AYNI değeri 12px/400 ile basıyor — kademe farkı veriden (kanal sayısı) doğuyor, ' +
        'bilgi hiyerarşisinden değil. Üstündeki özet satırı ("Brüt (bugün)", gm-dashboard.tsx:56) 13px/500. Sonuç: ' +
        'kartın en büyük rakamı, kartın özetini değil özetin bir alt kırılımını gösteriyor — üstelik iki değer bugün ' +
        'BİREBİR aynı (₺2.678,40).',
      measure:
        '1440×900 /kokpit (admin), aynı sütun (sağ kenar x=815): "Brüt (bugün)" 13px/500 satır 44px ↔ "İhracat" 15px/600 blok 54,5px; ' +
        'çok kanallı dalda aynı değer 12px/400 satır 40px (artifacts/critic/measure-kokpit-r10/probe-r10g.json, channel-bars.tsx:41,55)',
      target:
        'Tek kanal dalı çok kanallı dalla AYNI kademeyi kullansın (12-13px, font-weight 400) ve `Row`/ROW_BASE bandına insin ' +
        '(masaüstü 40px, mobil ≥44px): bölüm içindeki para sütununda en fazla 2 kademe (özet 13px/500, kırılım ≤13px/400) ve ' +
        'kırılım hiçbir zaman özetten büyük/kalın olmasın. Ölçüm: bölüm içi para düğümlerinin (fontSize, fontWeight) kümesi ⊆ {(13,500),(13,400)} ve blok yüksekliği 40-44px.',
      file: 'apps/web/src/modules/kokpit/components/channel-bars.tsx:41-48 (tek kanal dalı), apps/web/src/modules/kokpit/components/gm-dashboard.tsx:73-75 (p-4 sarmalayıcı)',
      openedRound: R,
    },
    FOCUS_FINDING(),
  ];
  r.scoreNotes =
    `Tur ${R} deltası — kriter 1: 5→4 (yeni P1 kokpit-channel-single-tier-10: "Günlük kanal satışları" para sütununda ` +
    '13px/500 özet ↔ 15px/600 kırılım, kırılım özetten baskın; aynı liste çok kanallı dalda 12px/400). ' + NOTE_COMMON;
}

// --- /kokpit?rol=depo
{
  const r = routes['/kokpit?rol=depo']!;
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5];
  r.total = r.scores.reduce((a, b) => a + b, 0);
  r.verdict = 'KAZANAN: Plantero (59 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok)';
  r.open = [FOCUS_FINDING()];
  r.scoreNotes = `Tur ${R} deltası — ` + NOTE_COMMON +
    ' Depo kesiti özel: Karantina özet satırı (13px/500, 44px) ile 4 lot satırı (13px/400, 40px) tek sütunda iki kademe — ' +
    'özet/kırılım ayrımı doğru yönde (özet baskın), admin\'deki ters kademe burada YOK.';
}

// --- /kokpit?rol=muhasebe
{
  const r = routes['/kokpit?rol=muhasebe']!;
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5];
  r.total = r.scores.reduce((a, b) => a + b, 0);
  r.verdict = 'KAZANAN: Plantero (59 ≥ 56, hiçbir kriter < 4, açık P0/P1 yok)';
  r.open = [FOCUS_FINDING()];
  r.scoreNotes = `Tur ${R} deltası — ` + NOTE_COMMON +
    ' Muhasebe kesiti en yoğun kesit: katlama üstü 30 bilgi birimi (14 satır + 11 StatStrip hücresi + 5 KPI), ' +
    'katlama üstü metin rengi 4 (nötr, muted, destructive, muted/0.7).';
}

// --- /kokpit?rol=satis
{
  const r = routes['/kokpit?rol=satis']!;
  r.round = R;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5];
  r.total = r.scores.reduce((a, b) => a + b, 0);
  r.verdict = 'KAZANAN: Plantero (58 ≥ 56, hiçbir kriter < 4, açık P0/P1 yok — açık P2\'ler kazanmayı engellemez)';
  r.open = [
    {
      id: 'kokpit-satis-kpi-band-width-10',
      criterion: 2,
      severity: 'P2',
      text:
        'Satış kesitinde KPI şeridi içerik genişliğinin yarısında bitiyor: `KpiStripRow` 3 ve daha az kartta `stripCompact` ' +
        '(kpi-strip.tsx:29-31) veriyor, kartlar `flex-grow: 0` + sabit 196px oluyor. Aynı şerit diğer dört rolde `flex-grow: 1` ' +
        'ile 1152px\'in tamamına yayılıyor. Sonuç: son dikey hairline x=852\'de havada kalıyor, sağında 564px boş bant duruyor ve ' +
        'altındaki kartların hepsi tam genişlikte — bant hizası kopuyor.',
      measure:
        '1440×900 /kokpit: satış kartları 196+196+196 = 588/1152px (%51), flexGrow 0, son kart sağ kenarı x=852; ' +
        'admin/depo/üretim 287,3+288,3×3 = 1152/1152 (%100), muhasebe 229,6+230,6×4 = 1152/1152 — flexGrow 1 ' +
        '(artifacts/critic/measure-kokpit-r10/, kpi-strip.tsx:29)',
      target:
        'Masaüstünde KPI bandı kart sayısından bağımsız olarak içerik genişliğinin tamamını kaplasın (kartlar eşit paylı, ' +
        'aralarında yüzen boşluk olmadan): 3 kartta da şerit toplam genişliği = 1152px (%100) ve son hairline içerik sağ kenarında bitsin. ' +
        'Tur 4\'te çözülen "kartlar arasında yüzen ~500px boşluk" sorunu ızgara payıyla (her kart 1/4 sütun) korunmalı, sabit 196px ile değil.',
      file: 'apps/web/src/components/kpi-strip.tsx:29-33 (compact dalı), apps/web/src/components/kpi-card.tsx (stripCompact genişliği)',
      openedRound: R,
    },
    FOCUS_FINDING(),
  ];
  r.scoreNotes =
    `Tur ${R} deltası — kriter 2: 5→4 (yeni P2 kokpit-satis-kpi-band-width-10: KPI bandı 588/1152px). ` + NOTE_COMMON;
}

// --- /kokpit?rol=uretim
{
  const r = routes['/kokpit?rol=uretim']!;
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5];
  r.total = r.scores.reduce((a, b) => a + b, 0);
  r.verdict = 'KAZANAN: Plantero (59 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok — açık P2\'ler kazanmayı engellemez)';
  r.open = [
    {
      id: 'kokpit-wo-badge-anatomy-10',
      criterion: 11,
      severity: 'P2',
      text:
        '"Son iş emirleri" sütununda tek rozet bileşeni İKİ anatomi çiziyor: "Planlandı" (info), "Üretimde" (success) ve ' +
        '"Kapatıldı" (muted) dolgulu pil; "Bitti" (finished) dolgusuz — yalnızca nokta + metin (status-badge.tsx:76 ' +
        '`SUBTLE_STATUS = { work_order: ["finished"] }`). Gerekçe belgeli (in_progress ile finished aynı yeşil aileden), ' +
        'ama AYNI bileşen `delivery` kind\'ında bu yaklaşımı Tur 5\'te açıkça reddedip ("saf tutarsızlık") ayrımı TONdan ' +
        'kurmuştu (shipped=primary, delivered=success). work_order hâlâ eski dolgu/dolgusuz ayrımında.',
      measure:
        '1440×900 /kokpit (üretim şefi): 12 rozetin 10\'u dolgulu (backgroundColor ≠ transparent), 2\'si dolgusuz — ' +
        'ikisi de "Bitti"; aynı sütunda 3 farklı zemin dili (artifacts/critic/measure-kokpit-r10/probe-r10.json, badges)',
      target:
        'Aynı sütundaki tüm iş emri rozetleri tek anatomi (dolgulu pil, h-5, 11px) olsun; in_progress↔finished ayrımı ' +
        'dolgudan değil TONdan kurulsun (delivery\'de olduğu gibi) — ölçümde dolgusuz rozet sayısı 0/12 ve ' +
        'iki durumun backgroundColor değerleri birbirinden farklı.',
      file: 'apps/web/src/components/status-badge.tsx:76 (SUBTLE_STATUS), apps/web/src/lib/status.ts (work_order tonları)',
      openedRound: R,
    },
    FOCUS_FINDING(),
  ];
  r.scoreNotes = `Tur ${R} deltası — ` + NOTE_COMMON +
    ' Üretim kesiti: "Hat durumu" ve "Son iş emirleri" 2 satırlık anatomide 52,5-54,5px (≤56px hedefi içinde), ' +
    'katlama üstü 19 bilgi birimi.';
}

card.round = R;
card.note =
  `Tur ${R} (kritik doğrulama, örnekleme Europe/Istanbul 7 Eylül). 5 rol kesiti yeniden çekildi ` +
  '(scripts/shot-kokpit-r3.ts, 1440×900 + 390×844 → artifacts/screens/kokpit-<rol>/). Ölçümler: ' +
  'artifacts/critic/measure-kokpit-r10/ — pnpm measure (5 rol × 2 viewport), YENİ scripts/probe-kokpit-r10.ts ' +
  '(bölüm anatomisi, satır bandı, bayt-bayt aynı satır, tabular kapsaması, rozet anatomisi, boş durum, kolon dibi), ' +
  'probe-kokpit-r10b/c.ts (iskelet ↔ gerçek sayfa bire bir karşılaştırma, iki viewport), probe-kokpit-r10d.ts ' +
  '(hover/active/focus + mobil dokunma hedefleri), probe-kokpit-r10e.ts (gerçek Tab turu odak dili), ' +
  'probe-kokpit-r10f.ts (katlama üstü bilgi birimi + renk sayısı), probe-kokpit-r10g.ts (para sütunu kademe tutarlılığı). ' +
  'TUR 9 BULGULARI YENİDEN ÖLÇÜLDÜ: kokpit-loading-skeleton-mismatch-09 KAPALI DOĞRULANDI (iskelet ↔ gerçek: şerit 80↔80 / 76↔76, ' +
  'kart 287,3↔287,3 / 152×72↔152×72, başlık 44↔44, satır 40↔40 / 63↔62,5-64,5), kokpit-activity-dupe-06 KAPALI DOĞRULANDI ' +
  '(bayt-bayt aynı satır 0/33), kokpit-meta-tabular-08 KAPALI DOĞRULANDI (rakam taşıyan yaprak düğümlerin tabular olmayanları ' +
  'yalnızca düzyazı cümleler ve ürün adları). YENİ: 1 P1 (admin kanal kırılımı kademe tersliği), 3 P2 (odak dili, satış KPI bant ' +
  'genişliği, iş emri rozet anatomisi). KAZANAN: depo/muhasebe/satış/üretim kesitlerinde Plantero; admin kesitinde referans (açık P1).';

writeFileSync(FILE, JSON.stringify(card, null, 2));
console.error('kokpit.json güncellendi');
for (const [k, v] of Object.entries(card.routes)) console.error(k, v.total, v.scores.join(','), 'açık:', v.open.length);

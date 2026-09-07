/**
 * Tur 12 kokpit puan kartı güncellemesi (docs/DESIGN-SCORECARD.md).
 *   tsx scripts/critic-kokpit-r12-update.ts
 * Ölçüm kaynağı: artifacts/critic/measure-kokpit-r12/{<rol>-<vp>.json, probe-r12.json, probe-r12b.json}
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const P = resolve(process.cwd(), 'artifacts', 'critic', 'kokpit.json');
const card = JSON.parse(readFileSync(P, 'utf8')) as {
  module: string;
  round: number;
  note: string;
  routes: Record<string, any>;
};

const ROUND = 12;

const FOCUS = {
  admin: '1440×900 /kokpit (admin): main içindeki 42 odak durağının 38’i focus-visible:ring taşıyor, 4’ü taşımıyor — dördü de KPI şerit kartı (287,3/288,3×80). 390×844’te de aynı 4 kart (152×72).',
  depo: '1440×900 /kokpit (depo): 26 odak durağının 22’si ring, 4’ü KPI şerit kartı (287,3/288,3×80). 390×844: aynı 4 kart (152×72).',
  muhasebe: '1440×900 /kokpit (muhasebe): 28 odak durağının 23’ü ring, 5’i KPI şerit kartı (229,6/230,6×80). 390×844: aynı 5 kart (152×72).',
  satis: '1440×900 /kokpit (satış): 21 odak durağının 18’i ring, 3’ü KPI şerit kartı (196×80). 390×844: aynı 3 kart (152×72).',
  uretim: '1440×900 /kokpit (üretim şefi): 20 odak durağının 16’sı ring, 4’ü KPI şerit kartı (287,3/288,3×80). 390×844: aynı 4 kart (152×72).',
} as const;

const FOCUS_TEXT =
  'Kokpit içinde İKİ farklı odak dili var: liste satırları (RowLink, shared.tsx:81), bölüm başlıklarındaki "Tümü" bağlantıları (shared.tsx:29) ve StatStrip hücreleri (shared.tsx:233) `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` çiziyor; KPI şeridi kartları (kpi-card.tsx `variant="strip"` sarmalayıcı <Link>/<button>, satır 218-227) hiçbir focus-visible sınıfı taşımadığı için tarayıcının varsayılan `outline: auto 1px` halkasına düşüyor. Odak görünür ama aynı ekranda 1px UA çerçevesi ile 2px iç halka yan yana. Tur 10’dan beri kpi-card.tsx’e dokunulmadı (git log: son değişiklik 562d5de).';
const FOCUS_TARGET =
  'Odaklanabilir her kokpit yüzeyi tek dil kullansın: KpiCard `cls` zincirine `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` (strip) / `focus-visible:ring-offset-2` (card) eklensin — ölçümde focus-visible:ring taşımayan odak durağı sayısı 0.';
const FOCUS_FILE = 'apps/web/src/components/kpi-card.tsx:190-227 (cls zinciri, href/onClick dalları)';

const scoreNotes: Record<string, string> = {
  '/kokpit?rol=admin':
    'Tur 12 deltası — puan değişmedi (59). Kokpit modülünün hiçbir dosyası Tur 11’den beri değişmedi (git log: kpi-card.tsx / kpi-strip.tsx / status-badge.tsx / modules/kokpit son commit 562d5de, Tur 10), ölçümler bire bir aynı çıktı: scrollWidth 1440 = clientWidth, satır yükseklikleri [40, 41, 55,5], h1 24px/600, 21 farklı renk, 390px’te taşma yok ve 44px altı tek eleman etkileşimsiz breadcrumb metni (39,3×19,5). Kriter 8 = 4: kokpit-focus-ring-dialect-10 hâlâ açık (4/42 odak durağı UA outline’ında). DÜZELTME: Tur 11 kartındaki verdict dizesi ("KAZANAN: Stripe … açık P1 var") kendi open listesiyle çelişiyordu — o listede yalnızca P2 vardı; kazanma kuralı (toplam 59 ≥ 56, hiçbir kriter < 4, açık P0/P1 yok) Tur 11’de de sağlanıyordu. Tur 12’de doğru verdict yazıldı.',
  '/kokpit?rol=depo':
    'Tur 12 deltası — puan değişmedi (59). Ölçümler Tur 11 ile aynı: satır yüksekliği [40, 41, 41] (Linear bandı 36-40px’in üst sınırında), ilk ekranda 19 satır, scrollWidth 1440 = clientWidth, 390px’te 19 kart [62,5, 63,5, 64,5] (hedef 56-72px), 22 farklı renk. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/26).',
  '/kokpit?rol=muhasebe':
    'Tur 12 deltası — puan değişmedi (59). Ölçümler Tur 11 ile aynı: 15 satır [40, 41, 41], 15 farklı renk (beş kesitin en disiplinlisi), sayısal yaprakların yalnızca 4’ü tabular-nums dışında ve dördü de sayı sütunu değil (alt başlık/etiket metni). Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (5/28).',
  '/kokpit?rol=satis':
    'Tur 12 deltası — puan değişmedi (58). Kriter 2 = 4: kokpit-satis-kpi-band-width-10 hâlâ açık — üç KPI kartı 196+196+196 = 588/1152px (%51), flexGrow 0, son hairline x=852’de havada; diğer dört rolde şerit 1152/1152px. Kriter 8 = 4: KPI şerit kartları (3/21) UA outline’ında. DEĞERLENDİRİLDİ, AÇILMADI (Tur 11 gerekçesi aynen geçerli, probe-r12b.json badgeAnatomy.collisions): "Son siparişler" sütununda "Sipariş onaylı" (confirmed) ve "Sevk edildi" (delivered) aynı görsel imzayı taşıyor — lib/status.ts’teki belgelenmiş ton politikası gri aileyi bilinçli olarak sinyalsiz durumlara ayırıyor, rozet metinle etiketli, referanslar da aynı griyi paylaşıyor; kriter 4 = 5 korunur.',
  '/kokpit?rol=uretim':
    'Tur 12 deltası — puan değişmedi (59). Ölçümler Tur 11 ile aynı: 15 satır [40, 54,5, 55,5], 24 farklı renk, 390px’te 15 kart [59,5, 65,5, 65,5]. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/20). Kriter 11 = 5 korunur: kokpit-wo-badge-anatomy-10 hâlâ açık ama P2 — "Son iş emirleri" 8 rozetin 6’sı dolgulu, 2’si ("Bitti") dolgusuz; rozet yüksekliği (20px) ve punto (11px) tek, ayrım yalnızca zeminde, hem 1440px hem 390px’te aynı.',
};

const verdicts: Record<string, string> = {
  '/kokpit?rol=admin': 'KAZANAN: Plantero (59 ≥ 56, hiçbir kriter < 4, açık P0/P1 yok — açık P2 kazanmayı engellemez)',
  '/kokpit?rol=depo': 'KAZANAN: Plantero (59 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok)',
  '/kokpit?rol=muhasebe': 'KAZANAN: Plantero (59 ≥ 56, hiçbir kriter < 4, açık P0/P1 yok)',
  '/kokpit?rol=satis': 'KAZANAN: Plantero (58 ≥ 56, hiçbir kriter < 4, açık P0/P1 yok — açık P2’ler kazanmayı engellemez)',
  '/kokpit?rol=uretim': 'KAZANAN: Plantero (59 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok — açık P2’ler kazanmayı engellemez)',
};

const focusKeyByRoute: Record<string, keyof typeof FOCUS> = {
  '/kokpit?rol=admin': 'admin',
  '/kokpit?rol=depo': 'depo',
  '/kokpit?rol=muhasebe': 'muhasebe',
  '/kokpit?rol=satis': 'satis',
  '/kokpit?rol=uretim': 'uretim',
};

for (const [route, r] of Object.entries(card.routes)) {
  r.round = ROUND;
  r.verdict = verdicts[route];
  r.winner = 'plantero';
  r.scoreNotes = scoreNotes[route];
  r.measures = [
    `artifacts/critic/measure-kokpit-r12/${route.includes('uretim') ? 'uretim_sefi' : route.split('=')[1]}-1440.json`,
    `artifacts/critic/measure-kokpit-r12/${route.includes('uretim') ? 'uretim_sefi' : route.split('=')[1]}-390.json`,
    'artifacts/critic/measure-kokpit-r12/probe-r12.json',
    'artifacts/critic/measure-kokpit-r12/probe-r12b.json',
  ];
  for (const o of r.open as any[]) {
    if (o.id === 'kokpit-focus-ring-dialect-10') {
      o.text = FOCUS_TEXT;
      o.measure = `${FOCUS[focusKeyByRoute[route]]} (artifacts/critic/measure-kokpit-r12/probe-r12.json → focusSummary)`;
      o.target = FOCUS_TARGET;
      o.file = FOCUS_FILE;
      o.reMeasuredRound = ROUND;
      o.status = 'açık';
    }
    if (o.id === 'kokpit-satis-kpi-band-width-10') {
      o.measure =
        '1440×900 /kokpit (satış): 3 KPI kartı 196+196+196 = 588 / 1152px (%51), son kart sağ kenarı x=852, admin/depo/üretim 287,3+288,3×3 = 1152/1152, muhasebe 229,6+230,6×4 = 1152/1152 (artifacts/critic/measure-kokpit-r12/probe-r12.json → focusSummary.withoutRing genişlikleri; kpi-strip.tsx:33-36 compact dalı ve kpi-card.tsx:203 `md:min-w-[196px] md:shrink-0 md:flex-none md:grow-0` değişmedi — git log 562d5de). Tur 10/11 ile aynı.';
      o.reMeasuredRound = ROUND;
      o.status = 'açık';
    }
    if (o.id === 'kokpit-wo-badge-anatomy-10') {
      o.measure =
        '1440×900 ve 390×844 /kokpit (üretim şefi): "Son iş emirleri" 8 rozetin 6’sı dolgulu, 2’si dolgusuz — ikisi de "Bitti" (artifacts/critic/measure-kokpit-r12/probe-r12b.json → uretim_sefi.badgeAnatomy). Aynı panodaki "Hat durumu" (3/3) ve "Son duruşlar" (1/1) tamamen dolgulu. status-badge.tsx:66-67 `SUBTLE_STATUS = { work_order: new Set([\'finished\']) }` Tur 10’dan beri değişmedi.';
      o.reMeasuredRound = ROUND;
      o.status = 'açık';
    }
  }
}

card.round = ROUND;
card.note =
  'Tur 12 (kritik doğrulama, örnekleme Europe/Istanbul 7 Eylül 2026). 5 rol kesiti yeniden çekildi (scripts/shot-kokpit-r3.ts, 1440×900 + 390×844 → artifacts/screens/kokpit-<rol>/) ve Read ile bakıldı. Ölçümler: artifacts/critic/measure-kokpit-r12/ — pnpm measure (5 rol × 2 viewport) + scripts/probe-kokpit-r12.ts (KPI bandı genişliği/flexGrow, odak dili sayımı, kolon dibi, tabular kapsaması) + probe-kokpit-r12b.ts (rozet anatomisi, bölüm satırı sayısal kademeleri). TUR 11 BULGULARI YENİDEN ÖLÇÜLDÜ, ÜÇÜ DE AÇIK: kokpit-focus-ring-dialect-10 (P2, 5 rolde de), kokpit-satis-kpi-band-width-10 (P2, 588/1152px), kokpit-wo-badge-anatomy-10 (P2, 2/8 dolgusuz). Yeni P0/P1 yok; kokpit modülünün hiçbir dosyası Tur 11’den beri değişmedi (git log). Ölçüm eşikleri: her rolde scrollWidth = clientWidth (1440 ve 390), 390px’te 44px altı tek eleman etkileşimsiz breadcrumb metni, satır yükseklikleri 40-41px (çok satırlı anatomi 52,5-55,5px), mobil kart 59,5-65,5px, h1 24px/600 masaüstü / 20px/600 mobil, farklı renk 15-24. Kod düzeyi tarama temiz: kokpit modülünde `transition: all`/`transition-all`, `ease-in`, `scale(0)`, 300ms+ süre yok; `hover:` globals.css:10-16’da (hover:hover) and (pointer:fine) ile kapılı; tek animasyon motion-safe:animate-pulse. KAZANAN: beş rol kesitinin hepsinde Plantero (toplamlar 59/59/59/58/59; referans Stripe 56 / Linear 57).';

writeFileSync(P, JSON.stringify(card, null, 2) + '\n');
console.log('kokpit.json → tur 12 yazıldı');

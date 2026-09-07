/** Tur 11 kokpit puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const F = resolve(process.cwd(), 'artifacts', 'critic', 'kokpit.json');
const card = JSON.parse(readFileSync(F, 'utf8'));
const R = 11;

const FOCUS = (m: string) => ({
  id: 'kokpit-focus-ring-dialect-10',
  criterion: 8,
  severity: 'P2',
  text:
    'Kokpit içinde İKİ farklı odak dili var: liste satırları (RowLink, shared.tsx:77), bölüm başlıklarındaki "Tümü" bağlantıları ve StatStrip hücreleri (shared.tsx:233) `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` çiziyor; KPI şeridi kartları (kpi-card.tsx `variant="strip"` sarmalayıcı <Link>, satır 218-222) hiçbir focus-visible sınıfı taşımadığı için tarayıcının varsayılan `outline: auto 1px` halkasına düşüyor. Odak görünür ama aynı ekranda 1px UA çerçevesi ile 2px iç halka yan yana. Tur 10\'dan beri kpi-card.tsx\'e dokunulmadı (git log).',
  measure: m,
  target:
    'Odaklanabilir her kokpit yüzeyi tek dil kullansın: KpiCard `cls` zincirine `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` (strip) / `focus-visible:ring-offset-2` (card) eklensin — ölçümde focus-visible:ring taşımayan odak durağı sayısı 0.',
  file: 'apps/web/src/components/kpi-card.tsx:190-222 (cls zinciri, href/onClick dalları)',
  openedRound: 10,
});

const FOCUS_MEASURE: Record<string, string> = {
  '/kokpit?rol=admin': '1440×900 /kokpit (admin): main içindeki 42 odak durağının 38\'i focus-visible:ring taşıyor, 4\'ü taşımıyor — dördü de KPI şerit kartı (287,3×80 / 288,3×80). (artifacts/critic/measure-kokpit-r11/probe-r11.json)',
  '/kokpit?rol=depo': '1440×900 /kokpit (depo): 26 odak durağının 22\'si ring, 4\'ü KPI şerit kartı (287,3/288,3×80) UA outline\'ında.',
  '/kokpit?rol=muhasebe': '1440×900 /kokpit (muhasebe): 28 odak durağının 23\'ü ring, 5\'i KPI şerit kartı (229,6/230,6×80) UA outline\'ında.',
  '/kokpit?rol=satis': '1440×900 /kokpit (satış): 21 odak durağının 18\'i ring, 3\'ü KPI şerit kartı (196×80) UA outline\'ında.',
  '/kokpit?rol=uretim': '1440×900 /kokpit (üretim şefi): 20 odak durağının 16\'sı ring, 4\'ü KPI şerit kartı (287,3/288,3×80) UA outline\'ında.',
};

const BAND = {
  id: 'kokpit-satis-kpi-band-width-10',
  criterion: 2,
  severity: 'P2',
  text:
    'Satış kesitinde KPI şeridi içerik genişliğinin yarısında bitiyor: `KpiStripRow` 3 ve daha az kartta `stripCompact` veriyor (kpi-strip.tsx:33-36), kart `md:min-w-[196px] md:shrink-0 md:flex-none md:grow-0` alıyor (kpi-card.tsx:203). Aynı şerit diğer dört rolde `md:flex-1` ile 1152px\'in tamamına yayılıyor. Son dikey hairline x=852\'de havada kalıyor, sağında 564px boş bant duruyor, altındaki bölüm kartlarının hepsi tam genişlikte — bant hizası kopuyor.',
  measure:
    '1440×900 /kokpit (satış): 3 KPI kartı 196+196+196 = 588 / 1152px (%51), flexGrow 0, son kart sağ kenarı x=852; admin/depo/üretim 287,3+288,3×3 = 1152/1152 (%100), muhasebe 229,6+230,6×4 = 1152/1152 — flexGrow 1 (artifacts/critic/measure-kokpit-r11/probe-r11.json, kpiStrip.*). Tur 10 ile aynı; kpi-strip.tsx/kpi-card.tsx Tur 10\'dan beri değişmedi.',
  target:
    'Masaüstünde KPI bandı kart sayısından bağımsız olarak içerik genişliğinin tamamını kaplasın (eşit paylı, aralarında yüzen boşluk olmadan): 3 kartta da şerit toplam genişliği = 1152px (%100), son hairline içerik sağ kenarında. Tur 4\'te çözülen "kartlar arasında yüzen ~500px boşluk" ızgara payıyla (kart başına 1/4 sütun üst sınırı) korunmalı, sabit 196px ile değil.',
  file: 'apps/web/src/components/kpi-strip.tsx:33-36 (compact dalı), apps/web/src/components/kpi-card.tsx:203 (stripCompact genişliği)',
  openedRound: 10,
};

const WO_BADGE = {
  id: 'kokpit-wo-badge-anatomy-10',
  criterion: 11,
  severity: 'P2',
  text:
    '"Son iş emirleri" sütununda tek rozet bileşeni İKİ anatomi çiziyor: "Planlandı" (info), "Üretimde" (primary) ve "Kapatıldı" (muted) dolgulu pil; "Bitti" (success) dolgusuz — yalnızca nokta + metin (status-badge.tsx:72 `SUBTLE_STATUS = { work_order: new Set([\'finished\']) }`). Aynı bileşen `delivery` kind\'ında bu yaklaşımı Tur 5\'te açıkça reddedip ("saf tutarsızlık") ayrımı TONdan kurmuştu (shipped=primary, delivered=success); work_order hâlâ eski dolgu/dolgusuz ayrımında. Masaüstünde de mobilde de görünür.',
  measure:
    '1440×900 /kokpit (üretim şefi): "Son iş emirleri" 8 rozetin 6\'sı dolgulu, 2\'si dolgusuz — ikisi de "Bitti"; aynı sütunda 3 farklı zemin dili (artifacts/critic/measure-kokpit-r11/probe-r11b.json → badgeAnatomy). Tur 10 ile aynı; status-badge.tsx Tur 10\'dan beri değişmedi.',
  target:
    'Aynı sütundaki tüm iş emri rozetleri tek anatomi (dolgulu pil, h-5, 11px) olsun; in_progress↔finished ayrımı dolgudan değil TONdan kurulsun (delivery\'de olduğu gibi) — ölçümde dolgusuz rozet sayısı 0/8 ve iki durumun backgroundColor değerleri birbirinden farklı.',
  file: 'apps/web/src/components/status-badge.tsx:72 (SUBTLE_STATUS), apps/web/src/lib/status.ts (work_order tonları)',
  openedRound: 10,
};

const CHANNEL_CLOSED = {
  id: 'kokpit-channel-single-tier-10',
  closedRound: 11,
  verifiedBy:
    'ölçüm — 1440×900 /kokpit (admin) "Günlük kanal satışları": özet satırı 44px / para 13px/500, kırılım satırı 40px / para 13px/400; aynı kademe ailesi, ayrım yalnızca ağırlıkta ve "Banka" bölümüyle bire bir aynı (13px/500 özet + 13px/400 satır). Tur 10\'daki 15px/600 kırılım kademesi kalmadı (artifacts/critic/measure-kokpit-r11/probe-r11b.json → sectionRows).',
};

const SCORES: Record<string, { scores: number[]; note: string }> = {
  '/kokpit?rol=admin': {
    scores: [5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5],
    note:
      'Tur 11 deltası — kriter 1: 4→5. Gerekçe: Tur 10\'da açılan P1 kokpit-channel-single-tier-10 kapandı; "Günlük kanal satışları" para sütunu artık 13px/500 (özet) + 13px/400 (kırılım) — 15px/600 kırılım kademesi yok, "Banka" bölümüyle bire bir aynı gramer. Kriter 8: 4 (değişmedi) — KPI şerit kartları hâlâ UA outline\'ında (4/42), kpi-card.tsx Tur 10\'dan beri değişmedi. Toplam 58→59, referans (Stripe) 56. Açık P0/P1 yok → KAZANAN: Plantero.',
  },
  '/kokpit?rol=depo': {
    scores: [5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5],
    note:
      'Tur 11 deltası — puan değişmedi (59). Yeniden ölçüldü: scrollWidth 1440 = clientWidth (taşma yok), satır bandı 40/41/41px masaüstü ve 62,5-64,5px mobil, mobilde 44px altı dokunma hedefi yok (yalnızca etkileşimsiz breadcrumb span). Kriter 8 = 4: KPI şerit kartları (4/26) UA outline\'ında. Açık P0/P1 yok → KAZANAN: Plantero.',
  },
  '/kokpit?rol=muhasebe': {
    scores: [5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5],
    note:
      'Tur 11 deltası — puan değişmedi (59). Yeniden ölçüldü: rakam taşıyan yaprak düğümlerin tabular olmayanları yalnızca düzyazı cümleler ve bölüm başlıkları (4 adet); Mutabakat kuyruğu %/para kolonları 11px/400 + 13px/400 tek kademe; 390px\'te 5\'li KPI şeridi ve 4\'lü StatStrip\'ler 2x2\'ye kırılıyor, taşma yok. Kriter 8 = 4: KPI şerit kartları (5/28) UA outline\'ında. Açık P0/P1 yok → KAZANAN: Plantero.',
  },
  '/kokpit?rol=satis': {
    scores: [5, 4, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5],
    note:
      'Tur 11 deltası — puan değişmedi (58). Kriter 2 = 4: kokpit-satis-kpi-band-width-10 hâlâ açık (588/1152px). Kriter 8 = 4: KPI şerit kartları (3/21) UA outline\'ında. DEĞERLENDİRİLDİ, AÇILMADI: "Son siparişler" sütununda "Sipariş onaylı" (confirmed) ve "Sevk edildi" (delivered) bayt-bayt aynı görsel imzayı taşıyor (bg oklch(0.967 0.001 286.4), metin ve nokta rengi aynı — probe-r11b.json badgeAnatomy.collisions). Bulgu açılmadı: lib/status.ts:95-108\'de belgelenmiş ve status.test.ts ile korunan ton politikası "muted/neutral hariç her ton yalnızca bir durumda" diyor; gri aile bilinçli olarak sinyalsiz durumlara ayrılmış, rozet metinle etiketli (renk tek taşıyıcı değil) ve referanslar da (Linear backlog/canceled, Stripe canceled/refunded/blocked) aynı griyi paylaşır — kriter 4 "renk yalnızca anlam taşır" ihlal edilmiyor, kriter 4 = 5 korunur. Açık P0/P1 yok → KAZANAN: Plantero.',
  },
  '/kokpit?rol=uretim': {
    scores: [5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5],
    note:
      'Tur 11 deltası — puan değişmedi (59). Kriter 11 = 5 korunur: kokpit-wo-badge-anatomy-10 (2/8 dolgusuz "Bitti") tek bir durumu kapsıyor ve P2 — rozet yükseklik/font (20px/11px) ve etiket dili tüm sütunda tek; tutarlılık kırılması dolgu düzeyinde kalıyor. Kriter 8 = 4: KPI şerit kartları (4/20) UA outline\'ında. Açık P0/P1 yok → KAZANAN: Plantero.',
  },
};

const OPEN: Record<string, unknown[]> = {
  '/kokpit?rol=admin': [FOCUS(FOCUS_MEASURE['/kokpit?rol=admin']!)],
  '/kokpit?rol=depo': [FOCUS(FOCUS_MEASURE['/kokpit?rol=depo']!)],
  '/kokpit?rol=muhasebe': [FOCUS(FOCUS_MEASURE['/kokpit?rol=muhasebe']!)],
  '/kokpit?rol=satis': [BAND, FOCUS(FOCUS_MEASURE['/kokpit?rol=satis']!)],
  '/kokpit?rol=uretim': [WO_BADGE, FOCUS(FOCUS_MEASURE['/kokpit?rol=uretim']!)],
};

card.round = R;
card.note =
  'Tur 11 (kritik doğrulama, örnekleme Europe/Istanbul 7 Eylül 2026). 5 rol kesiti yeniden çekildi (scripts/shot-kokpit-r3.ts, 1440×900 + 390×844 → artifacts/screens/kokpit-<rol>/). Ölçümler: artifacts/critic/measure-kokpit-r11/ — pnpm measure (5 rol × 2 viewport) + YENİ scripts/probe-kokpit-r11.ts (KPI bandı genişliği/flexGrow, odak dili sayımı, kolon dibi, tabular kapsaması) ve probe-kokpit-r11b.ts (rozet anatomisi span[data-status], bölüm satırı sayısal kademeleri, StatStrip anatomisi). TUR 10 BULGULARI YENİDEN ÖLÇÜLDÜ: kokpit-channel-single-tier-10 (P1) KAPALI DOĞRULANDI (13px/500 özet + 13px/400 kırılım); kokpit-satis-kpi-band-width-10 (P2) AÇIK (588/1152px); kokpit-focus-ring-dialect-10 (P2) AÇIK (KPI şerit kartları 4/42, 4/26, 5/28, 3/21, 4/20); kokpit-wo-badge-anatomy-10 (P2) AÇIK (2/8 dolgusuz). Yeni P0/P1 yok. Kod düzeyi tarama temiz: kokpit modülünde `transition: all`, `ease-in`, `scale(0)`, 300ms+ süre yok; `hover:` globals.css:10-16\'da (hover:hover) and (pointer:fine) ile kapılı; active scale(0.97) `:not(:focus-visible)` ile klavyeden muaf; tek animasyon motion-safe:animate-pulse. KAZANAN: beş rol kesitinin hepsinde Plantero (toplamlar 59/59/59/58/59; referans 56/57).';

for (const [route, s] of Object.entries(SCORES)) {
  const r = card.routes[route];
  if (!r) throw new Error(`route yok: ${route}`);
  r.round = R;
  r.scores = s.scores;
  r.total = s.scores.reduce((a: number, b: number) => a + b, 0);
  r.scoreNotes = s.note;
  const prevOpen = (r.open ?? []) as Array<{ id: string }>;
  const keptIds = new Set((OPEN[route] as Array<{ id: string }>).map((o) => o.id));
  r.closed = r.closed ?? [];
  for (const o of prevOpen) {
    if (!keptIds.has(o.id)) r.closed.push({ ...o, closedRound: R, verifiedBy: CHANNEL_CLOSED.verifiedBy });
  }
  if (route === '/kokpit?rol=admin' && !r.closed.some((c: { id: string }) => c.id === CHANNEL_CLOSED.id)) {
    r.closed.push(CHANNEL_CLOSED);
  }
  r.open = OPEN[route];
  r.winner = 'Plantero';
}

writeFileSync(F, JSON.stringify(card, null, 2) + '\n');
console.log('kokpit.json güncellendi, tur', R);
for (const [route, r] of Object.entries(card.routes) as Array<[string, { total: number; open: unknown[] }]>) {
  console.log(' ', route, 'total', r.total, 'open', r.open.length);
}

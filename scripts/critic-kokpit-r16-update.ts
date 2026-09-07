/** Tur 16 kokpit puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const P = resolve(process.cwd(), 'artifacts/critic/kokpit.json');
type Finding = Record<string, unknown>;
type Route = { round: number; scores: number[]; total: number; verdict: string; winner?: string; scoreNotes?: string; open: Finding[]; closed: Finding[]; measures?: unknown; [k: string]: unknown };
const card = JSON.parse(readFileSync(P, 'utf8')) as { module: string; round: number; updatedRound?: number; note: string; routes: Record<string, Route> };

card.round = 16;
card.updatedRound = 16;
card.note =
  'Tur 16 (kritik doğrulama, örnekleme Europe/Istanbul 7 Eylül 2026). 5 rol kesiti yeniden çekildi (scripts/shot-kokpit-r3.ts → artifacts/screens/kokpit-<rol>/{desktop,mobile}.png) ve Read ile bakıldı. Ölçüm: artifacts/critic/measure-kokpit-r16/ — pnpm measure (5 rol × 2 viewport) + probe-kokpit-r16.ts (odak dili, rozet, kolon) + r16b (rozet anatomisi/data-status) + r16c (kolon dibi dengesi BalancedGrid columns-2 dahil, KPI bant genişliği) + r16d (odak kanıtı). ' +
  'TUR 15 BULGULARI YENİDEN ÖLÇÜLDÜ, ÜÇÜ DE AÇIK VE DEĞİŞMEMİŞ: kokpit-focus-ring-dialect-10 (P2, 5 rolde de — 42/26/28/21/20 odak durağının 4/4/5/3/4’ü ring taşımıyor), kokpit-satis-kpi-band-width-10 (P2 — 3×196 = 588/1152px, %51), kokpit-wo-badge-anatomy-10 (P2 — "Son iş emirleri" 8 rozetin 2’si ("Bitti"/finished) backgroundColor rgba(0, 0, 0, 0)). Yeni P0/P1 yok. ' +
  'git log: kokpit modülü dosyaları ve kpi-card/kpi-strip/status-badge Tur 10’dan (562d5de) beri değişmedi; aradaki tek shell değişikliği DocumentChain sıralaması (e344834) kokpiti etkilemiyor — ölçümler Tur 15 ile bayt bayt aynı çıktı (satır yükseklikleri, renk sayısı, taşma). ' +
  'Ölçüm eşikleri: her rolde scrollWidth = clientWidth (1440 ve 390 → yatay taşma yok); 390px’te 44px altı tek eleman etkileşimsiz breadcrumb metni (39,3×19,5); satır yükseklikleri 40-41px (çok satırlı anatomi 54,5-55,5px), mobil kart 59,5-65,5px; h1 24px/600 masaüstü, 20px/600 mobil; farklı renk 13-24; kolon dibi farkı 62,5 / 57,5 / 62,5 / 78 / 139px (eşik ≤200px, admin BalancedGrid columns-2). ' +
  'Kod düzeyi tarama TEMİZ: kokpit modülünde ve KPI/rozet bileşenlerinde `transition: all`/`transition-all`, bare `ease-in`, `scale(0)`/`scale-0`, ≥300ms süre yok; tüm `hover:` sınıfları globals.css:9-16’daki `@custom-variant hover` ile `(hover:hover) and (pointer:fine)` altında. ' +
  'KAZANAN: beş rol kesitinin hepsinde Plantero (59/59/59/58/59; referans Stripe 56 / Linear 57; hiçbir kriter < 4; açık P0/P1 yok).';

const measured: Record<string, { focus: string; rows: string; mobile: string }> = {
  '/kokpit?rol=admin': {
    focus: '42 odak durağının 38’i focus-visible:ring, 4’ü KPI şerit kartı (287,3/288,3×80; mobil 152×72)',
    rows: '1440×900: 24 satır [40, 41, 55,5]; scrollWidth 1440 = clientWidth; 21 farklı renk; h1 24px/600; kolon dibi 1601 / 1538,5 → 62,5px',
    mobile: '390×844: 24 kart [60, 63,5, 65,5]; taşma yok; 44px altı yalnızca breadcrumb metni; h1 20px/600; 19 renk',
  },
  '/kokpit?rol=depo': {
    focus: '26 odak durağının 22’si ring, 4’ü KPI şerit kartı',
    rows: '1440×900: 19 satır [40, 41, 41]; taşma yok; 22 renk; kolon dibi 529 / 586,5 → 57,5px',
    mobile: '390×844: 19 kart [62,5, 63,5, 64,5]; taşma yok; 20 renk',
  },
  '/kokpit?rol=muhasebe': {
    focus: '28 odak durağının 23’ü ring, 5’i KPI şerit kartı (229,6/230,6×80)',
    rows: '1440×900: 15 satır [40, 41, 41]; taşma yok; 15 renk; kolon dibi 998,5 / 1061 → 62,5px',
    mobile: '390×844: 15 kart [63, 64, 64]; taşma yok; 13 renk',
  },
  '/kokpit?rol=satis': {
    focus: '21 odak durağının 18’i ring, 3’ü KPI şerit kartı (196×80)',
    rows: '1440×900: 19 satır [16, 41, 41]; taşma yok; 23 renk; kolon dibi 448 / 526 → 78px; KPI bandı 588/1152px (%51)',
    mobile: '390×844: 19 kart [16, 63,5, 64]; taşma yok; 21 renk',
  },
  '/kokpit?rol=uretim': {
    focus: '20 odak durağının 16’sı ring, 4’ü KPI şerit kartı',
    rows: '1440×900: 15 satır [40, 54,5, 55,5]; taşma yok; 24 renk; kolon dibi 904 / 765 → 139px',
    mobile: '390×844: 15 kart [59,5, 65,5, 65,5]; taşma yok; 23 renk',
  },
};

const notes: Record<string, string> = {
  '/kokpit?rol=admin':
    'Tur 16 deltası — puan değişmedi (59, Stripe 56). Ölçümler Tur 15 ile birebir aynı (24 satır [40, 41, 55,5]; 390px’te 24 kart [60, 63,5, 65,5]; 21/19 renk; taşma yok). Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (42 odak durağının 4’ü UA outline’ına düşüyor, kpi-card.tsx:189-215 cls zincirinde focus-visible:ring yok — kod Tur 10’dan beri değişmedi). Kriter 2 = 5 korunur: BalancedGrid (columns-2) kolon dibi farkını 62,5px’te tutuyor (eşik ≤200px).',
  '/kokpit?rol=depo':
    'Tur 16 deltası — puan değişmedi (59, Linear 57). 19 satır [40, 41, 41], mobilde 19 kart [62,5, 63,5, 64,5]; taşma yok, 44px altı etkileşimli eleman yok. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/26).',
  '/kokpit?rol=muhasebe':
    'Tur 16 deltası — puan değişmedi (59, Stripe 56). 15 satır [40, 41, 41]; 15 farklı renk (mobil 13) — beş rolün en disiplinli paleti. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (5/28).',
  '/kokpit?rol=satis':
    'Tur 16 deltası — puan değişmedi (58, Stripe 56). Kriter 2 = 4: kokpit-satis-kpi-band-width-10 açık ve DEĞİŞMEDİ — 3 KPI kartı 196+196+196 = 588/1152px (%51), son kart sağ kenarı x=852, altındaki bölüm kartları 1152px; artifacts/screens/kokpit-satis/desktop.png’de bandın sağ yarısı boş. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (3/21).',
  '/kokpit?rol=uretim':
    'Tur 16 deltası — puan değişmedi (59, Linear 57). 15 satır [40, 54,5, 55,5], mobilde 15 kart [59,5, 65,5, 65,5]. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/20). Kriter 11 = 5 KORUNUR (Tur 15 gerekçesiyle aynı, yeni kanıt yok): kokpit-wo-badge-anatomy-10 açık ama P2 — probe-r16b.json’da "Son iş emirleri" 8 rozetin 2’si ("Bitti"/finished) backgroundColor rgba(0, 0, 0, 0), diğer 6’sı dolgulu; rozet yüksekliği 20px ve punto 11px hepsinde aynı, ayrım yalnızca zeminde. Ölçüm Tur 15’ten farklı olmadığı için gerekçesiz puan düşüşü yapılmadı.',
};

const newMeasure: Record<string, string> = {
  'kokpit-focus-ring-dialect-10': 'FOCUS',
  'kokpit-satis-kpi-band-width-10':
    'Tur 16 yeniden ölçüm: DEĞİŞMEDİ. 1440×900 /kokpit (satış): 3 KPI kartı 196+196+196 = 588 / 1152px (%51), son kart sağ kenarı x=852, içerik sağ kenarı x=1416 (artifacts/critic/measure-kokpit-r16/probe-r16c.json → satis.strip). Diğer dört rolde şerit %100 (admin/depo/üretim 287,3+288,3×3 = 1152, muhasebe 229,6+230,6×4 = 1152). kpi-strip.tsx:31 `compact = count > 0 && count <= 3` ve kpi-card.tsx:203 `md:min-w-[196px] md:shrink-0 md:flex-none md:grow-0` aynı.',
  'kokpit-wo-badge-anatomy-10':
    'Tur 16 yeniden ölçüm: DEĞİŞMEDİ. 1440×900 /kokpit (üretim şefi): "Son iş emirleri" 8 rozetin 6’sı dolgulu (planned oklab(0.6 -0.051 -0.141/0.1), in_progress oklab(0.55 -0.141 0.075/0.1), closed oklch(0.967 0.001 286.4) ×4), 2’si dolgusuz — ikisi de "Bitti" (finished), backgroundColor rgba(0, 0, 0, 0) (artifacts/critic/measure-kokpit-r16/probe-r16b.json). Aynı panodaki "Hat durumu" (3/3) ve "Son duruşlar" (1/1) tamamen dolgulu. status-badge.tsx:72 `SUBTLE_STATUS = { work_order: new Set([\'finished\']) }` değişmedi.',
};

for (const [route, r] of Object.entries(card.routes)) {
  r.round = 16;
  r.verdict = 'KAZANAN: Plantero';
  r.winner = 'plantero';
  r.scoreNotes = notes[route] ?? r.scoreNotes;
  r.measures = { round: 16, ...measured[route] };
  for (const f of r.open) {
    const id = String(f.id);
    f.status = 'açık';
    f.lastVerifiedRound = 16;
    f.recheckedRound = 16;
    if (id === 'kokpit-focus-ring-dialect-10') {
      f.measure = `Tur 16 yeniden ölçüm: DEĞİŞMEDİ. 1440×900 ${route}: ${measured[route]!.focus} (artifacts/critic/measure-kokpit-r16/probe-r16.json → focusSummary); 390×844’te aynı kartlar (152×72). kpi-card.tsx:189-215 `.replace(/`/g, '') + '`cls` zincirinde hâlâ focus-visible:ring yok (kod Tur 10’dan beri değişmedi); odak GÖRÜNÜR (UA outline auto 1px, aynı --ring rengi) — bu yüzden P2 kalır, P1 değil.';
    } else if (newMeasure[id]) {
      f.measure = newMeasure[id];
    }
  }
}

writeFileSync(P, JSON.stringify(card, null, 2) + '\n');
console.log('kokpit.json → tur 16 yazıldı');

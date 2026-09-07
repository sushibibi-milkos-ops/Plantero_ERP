/** Tur 15 kokpit puan kartı güncellemesi (docs/DESIGN-SCORECARD.md).
 *  Ölçümler: artifacts/critic/measure-kokpit-r15/{m-*.json, probe-r15.json, probe-r15b.json}
 *  Ekranlar: artifacts/screens/kokpit-<rol>/{desktop,mobile}.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const P = resolve(process.cwd(), 'artifacts', 'critic', 'kokpit.json');
const card = JSON.parse(readFileSync(P, 'utf8')) as {
  routes: Record<string, { round: number; scores: number[]; total: number; reference: string; open: any[]; closed: any[]; scoreNotes?: string }>;
};

const R = 15;
const notes: Record<string, string> = {
  '/kokpit?rol=admin':
    'Tur 15 deltası — puan değişmedi (59, Stripe 56). Kokpit modülü + KpiCard/KpiStrip/StatusBadge dosyaları Tur 10’dan (562d5de) beri değişmedi; ara commit’ler (624915c…9c2c050) başka modülleri dokundu. Yeniden ölçüm (m-admin-*.json): scrollWidth 1440 = clientWidth, 390’da 390 = 390 (taşma yok), 24 satır [40, 41, 55,5], mobilde 24 kart [60, 63,5, 65,5], h1 24px/600 (mobil 20px/600), 21 farklı renk (mobil 19), punto dağılımı 13px ağırlıklı (78 düğüm) + 12/11/10 etiket kademeleri. 390px’te 44px altı tek eleman etkileşimsiz breadcrumb metni (39,3×19,5). Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/42), P2 — Tur 15’te odak GÖRÜNÜRLÜĞÜ kanıtlandı (artifacts/critic/kokpit-r15-focus-kpi.png): KPI şerit kartı :focus-visible’da outline auto/1px/oklab(0.55 -0.141 0.075 / 0.5) yani AYNI ring token’ının ince UA çizgisi — erişilebilirlik kaybı yok, yalnızca 2px inset ring’den farklı bir lehçe; P1’e yükseltilmedi. Kazanma kuralı sağlanıyor (59 ≥ 56, min kriter 4, açık P0/P1 yok).',
  '/kokpit?rol=depo':
    'Tur 15 deltası — puan değişmedi (59, Linear 57). Ölçümler Tur 13/14 ile birebir: 19 satır [40, 41, 41], 390px’te 19 kart [62,5, 63,5, 64,5], scrollWidth = clientWidth iki kırılımda da, 22 farklı renk (mobil 20), 44px altı etkileşimli eleman mobilde yok. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/26), P2. Kazanma kuralı sağlanıyor.',
  '/kokpit?rol=muhasebe':
    'Tur 15 deltası — puan değişmedi (59, Stripe 56). 15 satır [40, 41, 41], mobilde 15 kart [63, 64, 64], 15 farklı renk (beş kesitin en disiplinlisi; mobil 13), tabular-nums taşımayan yalnızca 3 yaprak ve üçü de sayı sütunu değil (probe-r15.json → nonTabular: "Nakit projeksiyonu (3 ay)", "%0,2 tamamlandı", "23 gün kaldı…"). Negatif tutarlar tek renk (destructive), pozitifler boyanmıyor. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (5/28), P2.',
  '/kokpit?rol=satis':
    'Tur 15 deltası — puan değişmedi (58, Stripe 56). Kriter 2 = 4: kokpit-satis-kpi-band-width-10 hâlâ açık — üç KPI kartı 196+196+196 = 588/1152px (%51), flexGrow 0, son dikey hairline x=852’de havada asılı; aynı şerit admin/depo/üretimde 287,3+288,3×3 = 1152/1152, muhasebede 229,6+230,6×4 = 1152/1152 (probe-r15.json → focusSummary.withoutRing genişlikleri). kpi-card.tsx:203 `md:min-w-[196px] md:shrink-0 md:flex-none md:grow-0` DEĞİŞMEDİ. Kriter 8 = 4: KPI şerit kartları (3/21) UA outline’ında. Satır ölçüsü [16, 41, 41] — 16px olan satış hunisi listesinin li’si (etiket+çubuk 16px içerik + 20px gap), tablo satırı değil; yeniden DEĞERLENDİRİLDİ, AÇILMADI. Kazanma kuralı sağlanıyor (58 ≥ 56, açık P0/P1 yok).',
  '/kokpit?rol=uretim':
    'Tur 15 deltası — puan değişmedi (59, Linear 57). 15 satır [40, 54,5, 55,5], 24 farklı renk (mobil 23), 390px’te 15 kart [59,5, 65,5, 65,5]. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/20). Kriter 11 = 5 korunur: kokpit-wo-badge-anatomy-10 hâlâ açık ama P2 — probe-r15b.json: "Son iş emirleri" 12 rozetin 2’si ("Bitti", finished) backgroundColor rgba(0, 0, 0, 0), diğer 10’u dolgulu (planned/in_progress/closed); rozet yüksekliği 20px ve punto 11px hepsinde aynı, ayrım yalnızca zeminde. Hem 1440px hem 390px ekran görüntüsünde görünür.',
};

const remeasure: Record<string, Record<string, string>> = {
  'kokpit-focus-ring-dialect-10': {
    '/kokpit?rol=admin': '1440×900 /kokpit (admin): main içindeki 42 odak durağının 38’i focus-visible:ring taşıyor, 4’ü taşımıyor — dördü de KPI şerit kartı (287,3/288,3×80). 390×844’te de aynı 4 kart (152×72). Tur 15 yeniden ölçüm: DEĞİŞMEDİ (artifacts/critic/measure-kokpit-r15/probe-r15.json → focusSummary). kpi-card.tsx:189-215 `cls` zincirinde hâlâ focus-visible:ring yok. Odak GÖRÜNÜR (artifacts/critic/kokpit-r15-focus-kpi.png: outline auto 1px, aynı --ring rengi) — bu yüzden P2 kalır, P1 değil.',
    '/kokpit?rol=depo': '1440×900 /kokpit (depo): 26 odak durağının 22’si ring, 4’ü KPI şerit kartı (287,3/288,3×80). 390×844: aynı 4 kart (152×72). Tur 15 yeniden ölçüm: DEĞİŞMEDİ (probe-r15.json).',
    '/kokpit?rol=muhasebe': '1440×900 /kokpit (muhasebe): 28 odak durağının 23’ü ring, 5’i KPI şerit kartı (229,6/230,6×80). 390×844: aynı 5 kart (152×72). Tur 15 yeniden ölçüm: DEĞİŞMEDİ (probe-r15.json).',
    '/kokpit?rol=satis': '1440×900 /kokpit (satış): 21 odak durağının 18’i ring, 3’ü KPI şerit kartı (196×80). 390×844: aynı 3 kart (152×72). Tur 15 yeniden ölçüm: DEĞİŞMEDİ (probe-r15.json).',
    '/kokpit?rol=uretim': '1440×900 /kokpit (üretim şefi): 20 odak durağının 16’sı ring, 4’ü KPI şerit kartı (287,3/288,3×80). 390×844: aynı 4 kart (152×72). Tur 15 yeniden ölçüm: DEĞİŞMEDİ (probe-r15.json).',
  },
  'kokpit-satis-kpi-band-width-10': {
    '/kokpit?rol=satis': '1440×900 /kokpit (satış): 3 KPI kartı 196+196+196 = 588 / 1152px (%51), son kart sağ kenarı x=852; admin/depo/üretim 287,3+288,3×3 = 1152/1152, muhasebe 229,6+230,6×4 = 1152/1152 (artifacts/critic/measure-kokpit-r15/probe-r15.json). Tur 15 yeniden ölçüm: DEĞİŞMEDİ; kpi-strip.tsx:33-36 compact dalı ve kpi-card.tsx:203 aynı. artifacts/screens/kokpit-satis/desktop.png’de bandın sağ yarısı boş.',
  },
  'kokpit-wo-badge-anatomy-10': {
    '/kokpit?rol=uretim': '1440×900 ve 390×844 /kokpit (üretim şefi): "Son iş emirleri" 12 rozetin 10’u dolgulu, 2’si dolgusuz — ikisi de "Bitti" (finished), backgroundColor rgba(0, 0, 0, 0) (artifacts/critic/measure-kokpit-r15/probe-r15b.json → badges). Aynı panodaki "Hat durumu" (3/3) ve "Son duruşlar" (1/1) tamamen dolgulu. status-badge.tsx:72 `SUBTLE_STATUS = { work_order: new Set([\'finished\']) }` Tur 10’dan beri değişmedi. Tur 15 yeniden ölçüm: DEĞİŞMEDİ.',
  },
};

for (const [route, entry] of Object.entries(card.routes)) {
  entry.round = R;
  entry.total = entry.scores.reduce((a, b) => a + b, 0);
  if (notes[route]) entry.scoreNotes = notes[route];
  for (const f of entry.open) {
    const m = remeasure[f.id]?.[route];
    if (m) f.measure = m;
    f.lastVerifiedRound = R;
  }
}

writeFileSync(P, JSON.stringify(card, null, 2) + '\n');
console.log(
  Object.entries(card.routes)
    .map(([r, v]) => `${r}: tur ${v.round}, toplam ${v.total} (${v.reference}), açık ${v.open.length} (${v.open.map((o: any) => o.severity).join(',') || '-'})`)
    .join('\n'),
);

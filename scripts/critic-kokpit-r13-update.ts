/** Tur 13 kokpit puan kartı güncellemesi (docs/DESIGN-SCORECARD.md kural 1-3). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const P = resolve(process.cwd(), 'artifacts', 'critic', 'kokpit.json');
const card = JSON.parse(readFileSync(P, 'utf8'));

const notes: Record<string, string> = {
  '/kokpit?rol=admin':
    'Tur 13 deltası — puan değişmedi (59, Stripe 56). Kokpit modülünün hiçbir dosyası Tur 10’dan (562d5de) beri değişmedi; ölçümler bire bir aynı: scrollWidth 1440 = clientWidth (390’da 390 = 390), satır yükseklikleri [40, 41, 55,5], 31 satır, h1 24px/600 (mobil 20px/600), 21 farklı renk, 390px’te 44px altı tek eleman etkileşimsiz breadcrumb metni (39,3×19,5). Kriter 6 = 5 doğrulandı: tabular-nums taşımayan 21 sayısal yaprağın hepsi mono belge kodu (GR-/DN-/OP-/WO-) ya da düzyazı altbilgi; hiçbir sayı sütunu tabular dışı değil. Kriter 8 = 4: kokpit-focus-ring-dialect-10 hâlâ açık — klavye Tab ile ölçüldü, KPI şerit kartı `:focus-visible` eşleşiyor ama `outline: auto 1px oklab(... / 0.5)` offset 1px (UA), RowLink `outline: none` + 2px iç halka (artifacts/critic/kokpit-r13-focus-kpi.png ↔ kokpit-r13-focus-row.png). Odak GÖRÜNÜR olduğu için P2 kalır. Kazanma kuralı sağlanıyor (59 ≥ 56, min kriter 4, açık P0/P1 yok).',
  '/kokpit?rol=depo':
    'Tur 13 deltası — puan değişmedi (59, Linear 57). Ölçümler Tur 12 ile aynı: 19 satır [40, 41, 41] (Linear 36-40 bandının üst sınırı), 390px’te 19 kart [62,5, 63,5, 64,5] (hedef 56-72), scrollWidth = clientWidth iki kırılımda da, 22 farklı renk, mobilde 44px altı etkileşimli eleman yok. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/26 odak durağı UA outline’ında). Kazanma kuralı sağlanıyor.',
  '/kokpit?rol=muhasebe':
    'Tur 13 deltası — puan değişmedi (59, Stripe 56). 15 satır [40, 41, 41], 15 farklı renk (beş kesitin en disiplinlisi), tabular-nums taşımayan yalnızca 3 yaprak ve üçü de sayı sütunu değil ("Nakit projeksiyonu (3 ay)" başlığı, "%0,2 tamamlandı", "23 gün kaldı · günlük ₺67.689 gerekiyor"). Negatif tutarlar tek renk (destructive), pozitifler boyanmıyor — Stripe kuralı. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (5/28). DEĞERLENDİRİLDİ, AÇILMADI: "Nakit projeksiyonu" StatStrip hücreleri üstte dönem etiketi taşıyor (üç kademe), "KDV pozisyonu"/"Geciken alacak" iki kademe — aynı bileşenin belgelenmiş isteğe bağlı `top` yuvası; değer (15px/600 tabular) ve etiket (10px muted) kademesi üçünde de birebir aynı, anatomi kopmuyor.',
  '/kokpit?rol=satis':
    'Tur 13 deltası — puan değişmedi (58, Stripe 56). Kriter 2 = 4: kokpit-satis-kpi-band-width-10 hâlâ açık — üç KPI kartı 196+196+196 = 588/1152px (%51), flexGrow 0, son dikey hairline x=852’de havada, sağında 564px boş bant; aynı şerit admin/depo/üretimde 287,3+288,3×3 = 1152/1152, muhasebede 229,6+230,6×4 = 1152/1152 (artifacts/critic/measure-kokpit-r13/probe-r13.json → focusSummary.withoutRing genişlikleri). Kriter 8 = 4: KPI şerit kartları (3/21) UA outline’ında. Kazanma kuralı sağlanıyor (58 ≥ 56, min kriter 4, açık P0/P1 yok) — iki bulgu da P2.',
  '/kokpit?rol=uretim':
    'Tur 13 deltası — puan değişmedi (59, Linear 57). 15 satır [40, 54,5, 55,5], 24 farklı renk, 390px’te 15 kart [59,5, 65,5, 65,5]. Kriter 8 = 4: kokpit-focus-ring-dialect-10 açık (4/20). Kriter 11 = 5 korunur: kokpit-wo-badge-anatomy-10 hâlâ açık ama P2 — status-badge.tsx:66 `SUBTLE_STATUS = { work_order: new Set([\'finished\']) }` değişmedi, "Son iş emirleri" 8 rozetin 2’si ("Bitti") `bg-transparent`; rozet yüksekliği (20px), punto (11px), nokta ve metin etiketi üçünde de aynı, ayrım yalnızca zeminde. Hem 1440px hem 390px’te görünür.',
};

for (const [route, r] of Object.entries<any>(card.routes)) {
  r.round = 13;
  r.scoreNotes = notes[route] ?? r.scoreNotes;
  r.verdict = 'KAZANAN: Plantero';
  for (const o of r.open ?? []) {
    if (o.id === 'kokpit-focus-ring-dialect-10') {
      o.measure = `${o.measure} — Tur 13 yeniden ölçüm: aynı (artifacts/critic/measure-kokpit-r13/probe-r13.json). Klavye Tab doğrulaması: KPI kartı :focus-visible eşleşiyor, outline "auto 1px oklab(0.55 -0.141 0.075 / 0.5)" offset 1px; RowLink outline none + 2px inset ring.`;
    }
    if (o.id === 'kokpit-satis-kpi-band-width-10' || o.id === 'kokpit-wo-badge-anatomy-10') {
      o.measure = `${o.measure} — Tur 13 yeniden ölçüm: değişmedi.`;
    }
    o.lastVerifiedRound = 13;
  }
}
card.updatedRound = 13;
writeFileSync(P, JSON.stringify(card, null, 2) + '\n');
console.log('kokpit.json → tur 13');

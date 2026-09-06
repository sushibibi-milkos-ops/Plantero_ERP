/** gorsel-critic tur 12 — artifacts/critic/kalite.json kalıcı puan kartı güncellemesi (ölçüm kaynaklı). */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'artifacts/critic/kalite.json';
type Card = Record<string, any>;
const card: Card = JSON.parse(readFileSync(PATH, 'utf8'));

const NOTES: Record<string, string[]> = {
  '/kalite/kontroller': [
    'kriter 3: 4 (değişmedi) — measure-kalite-r12/kontroller-m: mobil ul>li 88px (bant 56-72; kardeş ekranlar sablonlar/geri-cagirma 63,5px, tedarikci 60px). P2 kalite-kontroller-10 açık.',
    'kriter 5: 5 (değişmedi) — probe-kalite-r12/colwidth: tablo 1152px, en geniş slack 98px (Lot) → shell normu ≤120px içinde; kontroller-d scrollWidth 1440/1440, tbody tr 36px, taşma yok.',
    'kriter 1/2/6: 5 (değişmedi) — h1 masaüstü 24px/600, mobil 20px/600; gövde 13px; nonTabularNumbers 0; kod/lot sütunları mono.',
    "kriter 9: 5 (değişmedi) — 390px'te 390/390, main içinde <44px dokunma hedefi 0; sayfa sonunda alt gezinme çubuğu metin örtmüyor (overlappedText null).",
  ],
  '/kalite/kontroller/[id]': [
    'kriter 3: 4 (değişmedi) — "bekliyor" (QC-2026-000001) ilk ekranı 6 alan + tek 200px girdi taşıyor; "Sonuç girişi" kartının sağı boş.',
    "kriter 12: 4 (değişmedi) — check-detail.tsx `rounded-lg border border-border/60 p-3` kalemi kartın içinde ikinci çerçeve; probe-kalite-r12/kontrol-id-d borderedInsideBordered 7 (P2 kalite-kontroller-id-06).",
    'kriter 7/8/9: 5 (değişmedi) — karar bloğu özenli boş durum; 390px 390/390, main içinde <44px hedef 0.',
  ],
  '/kalite/sablonlar': [
    'kriter 5: 4 (değişmedi) — probe-kalite-r12/colwidth: Ad width 688 / maxContent 197 → slack 491 (shell normu ≤120px). P2 kalite-sablonlar-04 açık.',
    'kriter 6: 4 (değişmedi) — mobil kartta kalem sayısı etiketsiz çıplak "4"/"5" (P2 kalite-sablonlar-01/-03).',
    'kriter 3: 5 (değişmedi) — 2 kayıtla sınırlı veri; tbody tr 36px, mobil kart 63,5px (bant içi), boş alan veri kaynaklı.',
  ],
  '/kalite/tedarikci-skoru': [
    'kriter 5: 4 (değişmedi) — probe-kalite-r12/colwidth: Tedarikçi width 590 / maxContent 331 → slack 259 (P2 kalite-tedarikci-04).',
    'kriter 7: 4 (değişmedi) — DataTable boş durumu özel metin veriyor ama tıklanabilir eylem yok.',
    'kriter 9: 4 (değişmedi) — 390px\'te KPI şeridi yatay kaydırmalı; 3 KPI\'dan yalnız 2\'si tam görünüyor ("En düşük skor" kırpık).',
    'kriter 6: 5 (değişmedi) — mobil kart 60px, skor/oran hücreleri sağ hizalı ve tabular; nonTabularNumbers 0.',
  ],
  '/kalite/izlenebilirlik': [
    'kriter 3: 4 (değişmedi) — arama öncesi 1440x900 ekranında başlık + arama alanı + ~350px kesikli boş durum; alt ~600px boş.',
    'kriter 7: 4 (değişmedi) — boş durum özenli (ikon + başlık + açıklama) ama tıklanabilir sonraki adım yok (P2 kalite-izlenebilirlik-05).',
    'kriter 9: 5 (değişmedi) — measure-kalite-r12/izlenebilirlik-m: 390/390, main içinde <44px dokunma hedefi 0.',
  ],
  '/kalite/geri-cagirma': [
    'kriter 5: 4 (değişmedi) — probe-kalite-r12/colwidth: Ürün / Lot width 419 / maxContent 209 → slack 210 (>120 shell normu). P2 kalite-geri-cagirma-10.',
    "kriter 3: 4 (değişmedi) — tek kayıt; ilk ekranın ~%80'i boş (veri kaynaklı). Mobil kart 63,5px, tbody tr 36px.",
    'kriter 12: 5 (değişmedi) — çerçeve çorbası yok; "Gerekçe" hücresi 320px\'te ellipsis ile kesiliyor (kabul edilebilir kırpma, scrollWidth 1440/1440).',
  ],
  '/kalite/geri-cagirma/[id]': [
    "kriter 9: 4 (değişmedi) — probe-kalite-r12/gc-id-m: KPI şeridi 989/358 (631px kayar), 6 karttan 2,5'i görünür; /kalite/tedarikci-skoru ile tutarlı puanlama.",
    'kriter 2: 4 (değişmedi) — "Etkilenen müşteriler" kartı sağdaki "Bildirim taslağı" kartından ~220px kısa; sol sütunda ölü alan.',
    'kriter 12: 4 (değişmedi) — "Bildirim taslağı" mono bloğu kart içinde ayrı çerçeveli kutuda (borderedInsideBordered 7).',
    'kriter 8: 5 (değişmedi) — birincil eylem ("Geri Çağırmayı Başlat") görünür, focus-visible ring 3px, hover (hover:hover) altında.',
  ],
  '/kalite/izlenebilirlik?lot=<lot no|uuid>': [
    'kriter 5: 4 (değişmedi) — probe-kalite-r12/lot-m: div.overflow-x-clip scrollWidth 393 / clientWidth 390; "Proteinsan Gıda Hammaddeleri Ltd. Şti." right=393 > vw=390, clippedTexts 0 (ellipsis yok). kalite-trace-lot-09 AÇIK (P2), tur 10-11 ile birebir aynı.',
    'kriter 9: 4 (değişmedi) — "Miktar dengesi" şeridi 792/358 = 434px kayıyor; 5 metrikten 3\'ü (Sevkiyat, Fire, Eldeki) ilk boyada viewport dışında.',
    'kriter 7: 5 (değişmedi) — derin bağlantı çözülürken iskelet basılıyor, boş durum atlanıyor.',
    'kriter 3: 5 (değişmedi) — 9 düğüm, gövde 13px, mobilde alt gezinme çubuğu metin örtmüyor (bottomNav.overlappedText null).',
  ],
};

for (const [route, r] of Object.entries<Card>(card.routes)) {
  r.previousTotal = r.total;
  r.delta = 0;
  r.round = 12;
  r.verdict = 'KAZANAN: Plantero';
  r.scoreNotes = NOTES[route] ?? r.scoreNotes;
  r.measure = { round: 12, shots: 'artifacts/screens/', measure: 'artifacts/critic/measure-kalite-r12/', probes: 'artifacts/critic/probe-kalite-r12/' };
  for (const o of r.open ?? []) {
    if (o.id === 'kalite-trace-lot-09') {
      o.measure =
        'Tur 12 (probe-kalite-r12/lot-m.json, 390x844, lot PL-260903-H1-01): div.overflow-x-clip scrollWidth 393 / clientWidth 390 (3px); outsideViewport: "Proteinsan Gıda Hammaddeleri Ltd. Şti." left=153 right=393 vw=390; clippedTexts 0 → ellipsis yok. Kök neden doğrulandı: trace-graph.tsx:85 kimlik span\'i `shrink-0` (asla kırpılmaz), derin düğümde girinti + ikon + tür etiketi ile birlikte 393px yapıyor. Tur 10-11 ile aynı.';
      o.recheckedRound = 12;
    }
  }
  card.summary.routes[route] = { total: r.total, verdict: 'KAZANAN: Plantero' };
}

card.round = 12;
card.summary.round = 12;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 12: kalite modülü bağımsız yeniden ölçüldü (referans sabit: Linear 57 veri / Stripe 56 finans-KPI). Araçlar: pnpm shot 1440x900 + 390x844 (artifacts/screens/kalite-*), pnpm measure (artifacts/critic/measure-kalite-r12/, 8 route × 2 viewport), scripts/probe-kalite-r9-lot.ts (artifacts/critic/probe-kalite-r12/*.json) ve scripts/probe-kalite-r11-colwidth.ts (Range ile gerçek metin genişliği → sütun slack, probe-kalite-r12/colwidth.json). Tur 11\'den bu yana kalite modülünde kod değişikliği yok (git log: yalnız core/satış-iade commit\'leri); tüm ölçümler tur 11 değerlerini birebir yeniden üretti (kontroller-m ul>li 88px, sablonlar Ad slack 491, tedarikçi slack 259, geri-cagirma Ürün/Lot slack 210, lot-m 393/390), bu yüzden 8/8 route\'ta puan değişmedi. Yatay taşma: 8 route × 2 viewport\'ta scrollWidth = clientWidth (tek istisna trace ağacının 3px\'i, P2). Mobilde main içinde <44px dokunma hedefi 0 (ölçüm aracının breadcrumb-page span\'i etkileşimli değil). Kod düzeyi tarama (transition: all / ease-in / scale(0) / >300ms / hover gating / transform-origin) apps/web/src/modules/quality + apps/web/src/app/(app)/kalite üzerinde temiz: tek animasyon compute-score-button.tsx:62 `animate-spin`; hover globals.css:10 `@custom-variant hover` ile (hover:hover) and (pointer:fine) altında. 8/8 route KAZANAN: Plantero (toplam ≥ referans, hiçbir kriter < 4, açık P0/P1 yok). Kalan bulguların tamamı P2.';

writeFileSync(PATH, JSON.stringify(card, null, 1) + '\n');
console.log('güncellendi:', PATH, '| tur', card.round);
for (const [k, v] of Object.entries<Card>(card.routes)) console.log(' ', k, v.total, v.verdict, 'open:', (v.open ?? []).length, 'p2:', (v.p2 ?? []).length);

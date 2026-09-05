/** Tur-4 kalite puan kartı güncellemesi (gorsel-critic). Tek seferlik yazıcı. */
import { readFileSync, writeFileSync } from 'node:fs';

type Route = Record<string, unknown>;
const path = 'artifacts/critic/kalite.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as {
  module: string; round: number; note: string; measuredAt: string; routes: Record<string, Route>;
};

card.round = 4;
card.measuredAt = '2026-09-05';
card.note = [
  'Tur 4: kalite modülü yeniden ölçüldü (Referans sabit: Linear 57 veri, Stripe 56 KPI/finans — docs/DESIGN-SCORECARD.md).',
  'Araçlar: pnpm shot (1440x900 + 390x844), pnpm measure (satır yüksekliği, scrollWidth/clientWidth, <44px dokunma hedefi, font dağılımı, renk sayısı) → artifacts/critic/measure-kalite-r4/,',
  'scripts/probe-kalite-r4.ts (taşan kap + kırpılan yaprak + viewport dışına taşan metin + miktar sütunlarında birim eki + `--scroll-ends` ile yatay kaydırıcıları uca sürüp yeniden ölçme),',
  'scripts/probe-kalite-r4-deeplink.ts (?lot= çözülürken 100 ms aralıklı DOM örneklemesi), scripts/shot-kalite-lot.ts.',
  'Dinamik id\'ler psql ile: qc_check 9a772fd6 (QC-2026-000001, pending, şablonsuz) + c94394de (QC-2026-000008, failed, 4 sonuç kalemi — karar verilmiş durum da ölçüldü), recall eb95da92 (RC-2026-000001), mamul lot PL-260808-H1-12.',
  'Tur 3\'ün 5 açık P1 bulgusunun BEŞİ DE ölçümle doğrulandı ve kapalı kaldı (closed[].verifiedRound=4).',
  'Tur 4\'te 1 yeni ölçülebilir P1 bulgu açıldı (tedarikçi skoru "Red miktarı" sütunu birimsiz ve karışık-birim toplamı).',
  'Kod düzeyi tarama (transition-all / çıplak ease-in / scale(0) / >=300ms / hover gating / transform-origin): apps/web/src/modules/quality ve app/(app)/kalite altında İHLAL YOK; hover globals.css:10 @custom-variant hover { @media (hover:hover) and (pointer:fine) } ile korunuyor.',
  'NOT: kalite modülünde /operator rotası yok, 1024x768 çekimi uygulanmadı.',
].join(' ');

function verify(routeKey: string, ids: string[], note: string) {
  const r = card.routes[routeKey] as { closed?: Array<Record<string, unknown>> };
  for (const c of r.closed ?? []) if (ids.includes(c.id as string)) { c.verifiedRound = 4; c.verifiedBy = note; }
}

verify('/kalite/kontroller/[id]', ['kalite-kontroller-id-04', 'kalite-kontroller-id-05'],
  'Tur 4 yeniden ölçüm: pnpm shot /kalite/kontroller/9a772fd6 — "Numune miktarı" alanı artık md:grid-cols-3 ızgarasında max-w-[200px] (1118px → 200px) ve "KG" son eki taşıyor; "Eldeki miktar" 40 KG · TIRE/KARANTINA (QC-000008\'de 14 KG · TIRE/RED). probe-kalite-r4: taşan kap 0, kırpılan yaprak 0.');
verify('/kalite/tedarikci-skoru', ['kalite-tedarikci-05'],
  'Tur 4 yeniden ölçüm: 390x844 çekimde başlık eylem grubu sayfa oluğunun içinde (sol 17px / sağ 16,5px), Ay+Yıl seçicileri tek satır, birincil düğme tam genişlik. pnpm measure 390x844: scrollWidth 390 = clientWidth 390, overflowX false.');
verify('/kalite/geri-cagirma/[id]', ['kalite-geri-cagirma-id-08'],
  'Tur 4 yeniden ölçüm: probe-kalite-r4 --scroll-ends 390x844 (KPI şeridi uca sürüldü) → clippedLeaves 0, beyondViewport 0; "Stoktaki miktar 75 ADET · 22,12 KG" uç konumda tam okunuyor.');
verify('/kalite/izlenebilirlik?lot=<lot no|uuid>', ['kalite-izlenebilirlik-05'],
  'Tur 4 yeniden ölçüm: probe-kalite-r4-deeplink — 810→1658 ms arası aria-busy=1 ve 11 iskelet düğümü; "Aramaya başlayın" hiçbir örnekte görünmüyor. Bilinmeyen lot (?lot=YOK-BOYLE-BIR-LOT-999) için "Lot bulunamadı — Bağlantıdaki … değeri bir lot numarasına veya kimliğine karşılık gelmiyor" hata durumu basılıyor.');

const upd: Record<string, { scores: number[]; verdict: string; delta: string; open?: unknown[]; p2add?: unknown[] }> = {
  '/kalite/kontroller': {
    scores: [5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5],
    verdict: 'Plantero',
    delta: '59 → 59, değişiklik yok. Yeniden ölçüm (measure-kalite-r4): tbody satırı 36px (8 satır), gövde 13px (71 düğüm), h1 24px/600/-0.6px, mobil kart 63,5px, 390px\'te scrollWidth 390 = clientWidth 390, main içinde <44px dokunma hedefi 0. k5=4 sabit: tablo kaydırıcısı scrollWidth 1412 > clientWidth 1152 (260px) ve "Mal kabul"/"Açılış" sütunları ilk ekranda tamamen kaydırıcının dışında — scroll-fade-x afordansı var, P2.',
  },
  '/kalite/kontroller/[id]': {
    scores: [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4],
    verdict: 'Plantero',
    delta: '54 → 58 (referans Linear 57). k6 3→5: tur 3\'ün iki P1\'i kapandı — ekranın tüm miktarları birim taşıyor ("40 KG · TIRE/KARANTINA", "14 KG · TIRE/RED", numune alanında "KG" son eki). k2 4→5: sayısal alan artık ızgara kolonunda (1118px → 200px). k11 4→5: FormQty kullanımı diğer 6 modülle aynı. k3 4 sabit: karar verilmiş durum yoğun (4 sonuç satırı + belge zinciri + genel/karar ızgarası) ama sonuç girişi durumunda 1118px kart genişliğinde tek 200px denetim var, ~918px boş. k12 4 sabit: her sonuç kalemi rounded-xl kartın içinde ayrı rounded-lg çerçeveli kutuda (kutu içinde kutu, check-detail.tsx:172).',
  },
  '/kalite/sablonlar': {
    scores: [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5],
    verdict: 'Plantero',
    delta: '59 → 59, değişiklik yok. Yeniden ölçüm: satır 36px, mobil kart 63,5px, tabular 2/2, taşan kap 0, kırpılan yaprak 0, 390px\'te taşma yok. k6=4 sabit: mobil kartta kalem sayısı hâlâ etiketsiz çıplak "4"/"5" (P2).',
  },
  '/kalite/tedarikci-skoru': {
    scores: [5, 5, 5, 5, 5, 4, 4, 5, 4, 5, 5, 5],
    verdict: 'Stripe',
    delta: '57 → 57 (referans Stripe 56). k2 4→5: tur 3\'ün P1\'i kapandı, 390px\'te başlık eylem grubu sayfa oluğunun içinde (sol 17px / sağ 16,5px). k6 5→4: "Red miktarı" sütununun 6 hücresinin 6\'sı da birimsiz ve değer karışık birimli bir toplam (aşağıdaki yeni P1). k9=4 sabit: KPI şeridi 390px\'te kaydırılabilir (472/358) — bilinçli desen. Diğerleri sabit: tabular 12/13, satır 36px, mobil kart 60px.',
    open: [
      {
        id: 'kalite-tedarikci-06',
        criterion: 6,
        severity: 'P1',
        text: '"Red miktarı" sütunu birimsiz çıplak sayı basıyor ("0", "8"); okuyucu 8\'in KG mi ADET mi olduğunu bilemez. Dahası değerin kendisi karışık birimli bir toplam: supplierScore.ts:48 `sum(lines.map(l => l.rejectedQty))` satırların uom\'unu gruplamadan topluyor — Proteinsan\'ın 1470 ADET + 421 KG teslimatı tek sayıya iniyor, dolayısıyla sütuna tek bir birim eklemek de doğru olmaz. Modülün geri kalanı (izlenebilirlik, geri çağırma detayı, kontrol detayı) her miktarda birim gösteriyor; bu sütun modülün kendi kuralını bozan tek yer. QtyCell zaten `uom` prop\'unu destekliyor ama çağrıda geçilmiyor.',
        measure: 'probe-kalite-r4 /kalite/tedarikci-skoru 1440x900: qtyCols = [{ head: "Red miktarı", cells: ["0","8","0","0","0","0"] }] — 6/6 hücre birimsiz. psql: receipt_lines × uoms → Tatlısu 8,0000 KG; Proteinsan aynı dönemde 1470 ADET + 421 KG (tek tedarikçide 2 farklı uom). supplier_scores tablosunda uom kolonu yok (şema dondurulmuş).',
        target: 'Sütun ya birimsiz orana çevrilir ("Miktar doğruluğu" %, skorun zaten %20 ağırlıklı bileşeni — şema değişikliği gerektirmez), ya da queries.ts\'te receipt_lines → uoms ile dönemin birim kümesi türetilip tek birimli tedarikçide `<QtyCell uom={...} />`, çok birimlide "—" + ipucu basılır. Kabul eşiği: qtyCols[*].cells içinde birimsiz ham miktar 0.',
        file: 'apps/web/src/modules/quality/components/supplier-score-table.tsx:40 (cell: <QtyCell value={row.original.rejectedQty} /> — uom yok), apps/web/src/modules/quality/queries.ts:172,187, packages/core/src/quality/supplierScore.ts:46-48',
        openedRound: 4,
      },
    ],
  },
  '/kalite/izlenebilirlik': {
    scores: [5, 5, 4, 5, 5, 5, 4, 5, 5, 5, 5, 5],
    verdict: 'Plantero',
    delta: '58 → 58, değişiklik yok. Arama öncesi durum; k3=4 doğası gereği (tek arama kutusu + boş durum), k7=4: boş durumda eylem düğmesi yok, metin ve ikon özenli. pnpm measure 390x844: scrollWidth 390 = clientWidth 390, <44px dokunma hedefi 0.',
  },
  '/kalite/geri-cagirma': {
    scores: [5, 5, 4, 5, 4, 5, 5, 5, 5, 5, 5, 5],
    verdict: 'Plantero',
    delta: '58 → 58, değişiklik yok. Yeniden ölçüm: satır 36px, mobil kart 63,5px, 390px\'te taşma yok. k5=4 sabit: masaüstü tablo kaydırıcısı 14px taşıyor (görünmez seviyede, P2). k3=4: veri 1 kayıt.',
  },
  '/kalite/geri-cagirma/[id]': {
    scores: [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4],
    verdict: 'Plantero',
    delta: '55 → 58 (referans Stripe 56). k6 3→5 ve k9 4→5: tur 3\'ün P1\'i kapandı — probe-kalite-r4 --scroll-ends 390x844 ile KPI şeridi uca sürüldüğünde kırpılan yaprak 0 ve viewport dışı metin 0; "75 ADET · 22,12 KG" tam okunuyor. KpiCard değerleri tabular-nums (kpi-card.tsx:144,161). k2=4 sabit: iki kolonlu ızgarada kartlar farklı yükseklikte (sol 250px, sağ 560px) ve "Aksiyon takibi" 330px boş blok. k12=4 sabit: "Bildirim taslağı" kartın içinde ayrı çerçeveli mono blok (kutu içinde kutu).',
  },
  '/kalite/izlenebilirlik?lot=<lot no|uuid>': {
    scores: [5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5],
    verdict: 'Plantero',
    delta: '56 → 58 (referans Linear 57). k7 3→5: tur 3\'ün P1\'i kapandı — derin bağlantı çözülürken 810–1658 ms arası aria-busy + 11 iskelet düğümü basılıyor, "Aramaya başlayın" hiç görünmüyor; bilinmeyen lot için adı geçen değerle birlikte "Lot bulunamadı" hata durumu var. k5=4 ve k9=4 sabit: 390px\'te en derin (5. seviye) düğümde cari adı viewport\'u 3px aşıp app-shell\'in overflow-x-clip\'inde sessizce kesiliyor (P2 shell-trace-graph-clip-02). Miktarlar 10/10 tabular ve birimli.',
  },
};

for (const [key, u] of Object.entries(upd)) {
  const r = card.routes[key] as Record<string, unknown>;
  if (!r) throw new Error(`route yok: ${key}`);
  r.previousTotal = r.total;
  r.round = 4;
  r.scores = u.scores;
  r.total = u.scores.reduce((a, b) => a + b, 0);
  r.verdict = u.verdict;
  r.delta = u.delta;
  r.open = u.open ?? [];
}

writeFileSync(path, JSON.stringify(card, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(Object.fromEntries(Object.entries(card.routes).map(([k, v]) => [k, { total: (v as Record<string, unknown>).total, verdict: (v as Record<string, unknown>).verdict, open: ((v as Record<string, unknown>).open as unknown[]).length }])), null, 1));

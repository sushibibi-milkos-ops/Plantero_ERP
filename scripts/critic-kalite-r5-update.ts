/** gorsel-critic tur 5 — artifacts/critic/kalite.json kalıcı puan kartını günceller. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Finding = Record<string, unknown>;
type Route = {
  round: number;
  reference: string;
  scores: number[];
  total: number;
  verdict?: string;
  open?: Finding[];
  closed?: Finding[];
  scoreNotes?: string[];
  measure?: Record<string, unknown>;
};

const file = resolve(process.cwd(), 'artifacts/critic/kalite.json');
const card = JSON.parse(readFileSync(file, 'utf8')) as { module: string; round: number; note: string; measuredAt: string; routes: Record<string, Route> };

card.round = 5;
card.measuredAt = '2026-09-05';
card.note =
  'Tur 5: kalite modülü bağımsız yeniden ölçüldü (referans sabit: Linear 57 veri, Stripe 56 finans/KPI — docs/DESIGN-SCORECARD.md). ' +
  'Araçlar: pnpm shot (1440x900 + 390x844) → artifacts/screens/kalite-*, pnpm measure → artifacts/critic/measure-kalite-r5/, ' +
  'scripts/probe-kalite-r5.ts (yatay kaydırılan kaplar, ellipsis kırpması, viewport dışı yaprak metin, tabular-nums denetimi, satır yüksekliği/ayracı, KPI değeri–ayraç boşluğu, mobilde sayfa sonunda alt gezinme örtmesi) → artifacts/critic/probe-kalite-r5/, ' +
  'scripts/probe-kalite-r4-deeplink.ts (?lot= ilk boya örneklemesi). Dinamik id\'ler psql ile yeniden alındı (veritabanı yeniden seed edilmiş): qc_check 9d0df596 (QC-2026-000001, pending, şablonsuz) + da7263e7 (QC-2026-000008, failed, 4 sonuç kalemi), recall ed92d2b0 (RC-2026-000001), mamul lot PL-260808-H1-12 (ayrıca ince ağaçlı PL-260801-H1-01 karşılaştırıldı). ' +
  'Tur 4\'te kapatılan 26 bulgunun tamamı yeniden ölçüldü ve kapalı kaldı (birim ekli miktarlar, virgüllü ondalık, KPI şerit varyantı, Türkçe ay seçici, mobil ≥44px dokunma hedefleri, ?lot= iskelet durumu, geri çağırma detayında tek şerit + çerçevesiz müşteri listesi). ' +
  'Tur 5\'te 2 yeni ÖLÇÜLEBİLİR P2 bulgu açıldı (kazanmayı engellemez): tedarikçi skorunda 6/6 satırı boş "Trend" sütunu; lot izlenebilirlik ağacında mobilde 3px viewport taşması (overflow-x-clip, ellipsis yok). ' +
  'Kod düzeyi tarama (transition-all / çıplak ease-in / scale(0) / ≥300ms / hover gating / transform-origin): apps/web/src/modules/quality ve app/(app)/kalite altında İHLAL YOK; tek animasyon compute-score-button.tsx içindeki animate-spin (bekleme göstergesi). hover globals.css:10 @custom-variant hover { @media (hover:hover) and (pointer:fine) } ile korunuyor. ' +
  'Not: /kalite modülünde /operator rotası yok, 1024x768 çekimi uygulanmadı. Ekran görüntülerinin sol altındaki siyah daire Next.js dev göstergesidir (uygulama arayüzü değil), bulgu sayılmadı. ' +
  'Gözlem (bulgu değil): yeşil hem marka vurgusu hem başarı durumu için kullanılıyor (kriter 4\'ün "yeşil ikisinden biri" notu); bu, 13 modülde 4 turdur kabul edilmiş uygulama geneli marka kararı olduğu için kalite turunda yeniden puanlanmadı.';

const now = 5;
const set = (
  route: string,
  scores: number[],
  notes: string[],
  measure: Record<string, unknown>,
  openAdd: Finding[] = [],
) => {
  const r = card.routes[route];
  if (!r) throw new Error(`route yok: ${route}`);
  r.round = now;
  r.scores = scores;
  r.total = scores.reduce((a, b) => a + b, 0);
  const ref = r.reference === 'stripe' ? 56 : 57;
  const blocking = [...(r.open ?? []), ...openAdd].filter((f) => f.severity === 'P0' || f.severity === 'P1');
  r.verdict = r.total >= ref && Math.min(...scores) >= 4 && blocking.length === 0 ? 'Plantero' : r.reference === 'stripe' ? 'Stripe' : 'Linear';
  r.scoreNotes = notes;
  r.measure = measure;
  r.open = [...(r.open ?? []), ...openAdd];
};

set(
  '/kalite/kontroller',
  [5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5],
  [
    'kriter 5: 4 (değişmedi) — tablo kabı yatay kayıyor: scrollWidth 1412 > clientWidth 1152 (260px, "Mal kabul" + "Açılış" sütunları ilk boyada görünmüyor). scroll-fade-x sönümlemesi ve sütun seçici mevcut olduğu için 3\'e düşürülmedi.',
    'kriter 1/3/6: 5 (değişmedi) — h1 24px/600, gövde 13px (71 düğüm), satır yüksekliği 36px, satır ayracı 1px oklab(…/0.5) hairline; tabular-nums denetiminde birimsiz/tabular olmayan sayı hücresi 0.',
    'kriter 9: 5 (değişmedi) — 390px\'te scrollWidth = clientWidth = 390, 44px altı dokunma hedefi yok (yalnızca etkileşimsiz breadcrumb metni), alt gezinme çubuğu sayfa sonunda içeriği örtmüyor (overlappedText null).',
  ],
  { desktop: { scrollWidth: 1440, clientWidth: 1440, rowHeight: 36, rows: 8, tableScroller: { scrollWidth: 1412, clientWidth: 1152 }, distinctColors: 22 }, mobile: { scrollWidth: 390, clientWidth: 390, cardHeight: 63.5, touchBelow44: 0, navOverlap: null } },
);

set(
  '/kalite/kontroller/[id]',
  [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4],
  [
    'kriter 3: 4 (değişmedi) — karar verilmemiş kontrolde (QC-2026-000001) ekranın alt yarısı tek satırlık forma ve boş duruma ayrılmış; 1440x900\'de ilk ekranda taşınan bilgi 6 alan + 1 giriş.',
    'kriter 12: 4 (değişmedi) — "Sonuç girişi" kartının içindeki "Genel değerlendirme" kendi çerçeveli kutusunda (kutu içinde kutu).',
    'kriter 6: 5 (değişmedi) — kapatılan bulgular yeniden doğrulandı: "14 KG · TIRE/RED" birimli, sonuç değeri "14,2" virgüllü, boş kalem "—" ile basılıyor (4/4 satır dolu).',
  ],
  { desktop: { rows: 4, rowHeights: [36, 37, 37], distinctColors: 20, fontLadder: [24, 18, 15, 14, 13, 12, 11, 10] }, mobile: { scrollWidth: 390, touchBelow44: 0, chainRail: { hidden: 961, snap: true, fade: true }, navOverlap: null } },
);

set(
  '/kalite/sablonlar',
  [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5],
  [
    'kriter 6: 4 (değişmedi) — ekrandaki tek sayı "Kalem" tamsayısı; sağa hizalı ve tabular ama para/birim disiplinini gösterecek veri yok.',
    'kriter 3: 5 (değişmedi) — 2 kayıtla sınırlı veri; satır yüksekliği 36px, 13px gövde, boş alan veri kaynaklı.',
  ],
  { desktop: { scrollWidth: 1440, rows: 2, rowHeight: 36, distinctColors: 18 }, mobile: { scrollWidth: 390, cardHeight: 63.5, touchBelow44: 0 } },
);

set(
  '/kalite/tedarikci-skoru',
  [5, 5, 4, 5, 5, 5, 4, 5, 4, 5, 5, 5],
  [
    'kriter 3: 5→4 — "Trend" sütunu 110px yer kaplıyor ama 6/6 satırda "—" basıyor (veritabanında tek dönem var, sparkline hiçbir satırda çizilemiyor). Yeni P2 bulgu: kalite-tedarikci-07.',
    'kriter 7: 4 (değişmedi) — skor hesaplanmamış dönem için özel boş durum yok.',
    'kriter 9: 4 (değişmedi) — KPI şeridi 390px\'te yatay kayıyor (scrollWidth 472 > clientWidth 358); snap-x + scroll-fade-x var, üçüncü kart yarım görünüyor.',
    'kriter 6: 5 (değişmedi) — kapatılan kalite-tedarikci-06 doğrulandı: "Miktar doğruluğu" %100/%95,3 olarak basılıyor, birimsiz ham miktar yok.',
  ],
  { desktop: { rows: 6, rowHeight: 36, distinctColors: 18, trendColumnEmptyCells: '6/6' }, mobile: { scrollWidth: 390, kpiRail: { scrollWidth: 472, clientWidth: 358, snap: true }, cardHeight: 60, touchBelow44: 0, navOverlap: null } },
  [
    {
      id: 'kalite-tedarikci-07',
      criterion: 3,
      severity: 'P2',
      text: '"Trend" sütunu tablo genişliğinden 110px alıyor ama hiçbir satırda içerik üretmiyor: supplier_scores\'ta tek dönem (2026-09) olduğu için sparkline koşulu (trend.length > 1) hiçbir satırda sağlanmıyor, 6/6 hücre "—".',
      measure: 'trend sütunu 6/6 hücre "—", sütun genişliği 110px (supplier-score-table.tsx:37)',
      target: 'Sütun, hiçbir satırda trend.length > 1 değilse hiç render edilmesin (kolon listesi koşullu) → tabloda %100 boş sütun 0',
      file: 'apps/web/src/modules/quality/components/supplier-score-table.tsx:37',
      openedRound: 5,
    },
  ],
);

set(
  '/kalite/izlenebilirlik',
  [5, 5, 4, 5, 5, 5, 4, 5, 5, 5, 5, 5],
  [
    'kriter 3: 4 (değişmedi) — arama öncesi ekranda yalnızca başlık + arama alanı + boş durum var.',
    'kriter 7: 4 (değişmedi) — boş durum (ikon + başlık + açıklama) özenli, ancak "lot bulunamadı" için ayrı bir hata durumu yok.',
    'kriter 8: 5 (değişmedi) — öneri satırlarında hover:bg-accent/40, klavye odağı görünür.',
  ],
  { desktop: { scrollWidth: 1440, distinctColors: 14, h1: '24px/600' }, mobile: { scrollWidth: 390, touchBelow44: 0 } },
);

set(
  '/kalite/geri-cagirma',
  [5, 5, 4, 5, 4, 5, 5, 5, 5, 5, 5, 5],
  [
    'kriter 3: 4 (değişmedi) — tek kayıt; ilk ekranın %80\'i boş (veri kaynaklı).',
    'kriter 5: 4 (değişmedi) — 1440px\'te "Gerekçe" sütunu satırın yarısını tek uzun cümleyle dolduruyor, sağ kenarda hizalanan başka veri yok.',
    'kriter 7: 5 (değişmedi) — liste boşken DataTable boş durumu, sayfa geçişinde (app)/loading.tsx iskeleti devrede.',
  ],
  { desktop: { rows: 1, rowHeight: 36, distinctColors: 18 }, mobile: { scrollWidth: 390, cardHeight: 63.5, touchBelow44: 0 } },
);

set(
  '/kalite/geri-cagirma/[id]',
  [5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4],
  [
    'kriter 2: 4 (değişmedi) — "Etkilenen müşteriler" kartı ile "Bildirim taslağı" kartı arasındaki yükseklik farkı sol sütunda ~300px ölü alan bırakıyor (items-start düzeltmesi sonrası kalan artık boşluk).',
    'kriter 12: 4 (değişmedi) — bildirim taslağı düz metin kutusunda mono yazıyla basılı; kart içinde ikinci bir çerçeve etkisi veriyor.',
    'kriter 6: 5 (değişmedi) — "75 ADET · 22,12 KG" birim bazında ayrılmış, KPI değeri ile komşu dikey ayraç arası 16px (çakışma yok); mobilde kırpma yok.',
  ],
  { desktop: { kpiValueGapToDivider: 16, distinctColors: 19, rows: 3 }, mobile: { scrollWidth: 390, kpiRail: { hidden: 643, snap: true }, chainRail: { hidden: 625 }, touchBelow44: 0, navOverlap: null } },
);

set(
  '/kalite/izlenebilirlik?lot=<lot no|uuid>',
  [5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5],
  [
    'kriter 5: 4 (değişmedi) — ağaç yapraklarında cari adı mobilde 3px viewport dışına taşıp overflow-x-clip ile ellipsissiz kesiliyor (yeni P2: kalite-trace-lot-09).',
    'kriter 9: 4 (değişmedi) — miktar dengesi şeridi 390px\'te yatay kayıyor (scrollWidth 792 > clientWidth 358); en sağdaki "Eldeki" değeri ilk boyada görünmüyor. snap-x + fade var.',
    'kriter 7: 5 (değişmedi) — ?lot= derin bağlantısında ilk boyada aria-busy=1 ve 11 skeleton ölçüldü (799–1583 ms), "Aramaya başlayın" metni görünmüyor; kalite-izlenebilirlik-05 kapalı kaldı.',
  ],
  {
    desktop: { scrollWidth: 1440, distinctColors: 17 },
    mobile: { scrollWidth: 390, kpiRail: { scrollWidth: 792, clientWidth: 358 }, clippedLeaf: { text: 'Proteinsan Gıda Hammaddeleri Ltd. Şti.', right: 393, vw: 390 }, touchBelow44: 0, navOverlap: null },
    deeplink: { firstPaintBusy: 1, skeletons: 11, resolvedMs: 1747 },
  },
  [
    {
      id: 'kalite-trace-lot-09',
      criterion: 5,
      severity: 'P2',
      text: 'İzleme ağacının derin düğümlerinde cari adı 390px viewport\'un 3px dışına taşıyor ve kap overflow-x-clip olduğu için son karakter (".") ellipsissiz kesiliyor — kullanıcı kaydırarak da göremiyor.',
      measure: 'yaprak düğüm right=393 > vw=390; kap: div.flex.min-w-0.flex-1.flex-col.overflow-x-clip scrollWidth 393 / clientWidth 390',
      target: 'Derin düğüm satırında sağ dolgu + truncate: metin kutusu right ≤ 390 ve taşan metin ellipsis ile bitsin → outsideViewport = []',
      file: 'apps/web/src/components/trace-graph.tsx',
      openedRound: 5,
    },
  ],
);

writeFileSync(file, JSON.stringify(card, null, 2) + '\n', 'utf8');
const lines = Object.entries(card.routes).map(([k, v]) => `${k}: ${v.total} (${v.reference}) → ${v.verdict}; açık P0/P1 ${(v.open ?? []).filter((f) => f.severity === 'P0' || f.severity === 'P1').length}, açık P2 ${(v.open ?? []).filter((f) => f.severity === 'P2').length}`);
console.log(lines.join('\n'));

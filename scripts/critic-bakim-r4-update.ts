/** Tur 4 — gorsel-critic puan kartı güncellemesi (docs/DESIGN-SCORECARD.md kural 1-3). */
import { readFileSync, writeFileSync } from 'node:fs';

type Finding = Record<string, unknown>;
const path = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as {
  module: string; round: number; note: string; measuredAt: string;
  routes: Record<string, { round: number; reference: string; referenceTotal: number; scores: number[]; total: number; verdict: string; scoreNotes: string; open: Finding[]; closed: Finding[] }>;
};

card.round = 4;
card.measuredAt = '2026-09-06';
card.note = 'Tur 4 — gorsel-critic doğrulama turu. Tüm açık bulgular yeniden ölçüldü (pnpm measure + scripts/probe-bakim-r3.ts + scripts/probe-bakim-r4-oee-skel.ts): hiçbiri kapanmadı (bu tur bakım modülüne düzeltme uygulanmadı; builder Tur 4\'te yalnızca iki detay route\'unu kapatmıştı, onlar yeniden ölçülüp doğrulandı). İKİ YENİ P1: /bakim/makineler uygulamadaki 154 KpiCard kullanımının `variant="strip"` kullanmayan TEK yeri (136px kart ızgarası) ve `icon=` geçen TEK yeri (4 süs ikonu) → k11 5→4, k10 5→4, toplam 57→55, KAZANAN: Linear. /bakim/oee\'de yükleme iskeleti ilk kez ölçüldü (56px sıçrama, çip satırı yok) → k7 5→4, toplam 57→56 = Stripe 56, hâlâ kazanıyor. Kod düzeyi tarama temiz: maintenance modülünde transition-all / ease-in / >300ms / scale(0) yok; hover `@custom-variant hover` ile (hover:hover) and (pointer:fine) altına alınmış (globals.css:7-12).';

const R = card.routes;

// --- /bakim/makineler: iki yeni P1 (k10, k11)
R['/bakim/makineler']!.round = 4;
R['/bakim/makineler']!.scores = [5, 5, 4, 5, 5, 4, 4, 5, 5, 4, 4, 5];
R['/bakim/makineler']!.total = 55;
R['/bakim/makineler']!.verdict = 'Linear';
R['/bakim/makineler']!.scoreNotes =
  'Tur 4 delta: k10 5→4 ve k11 5→4 — ölçüm: uygulamadaki 154 `<KpiCard>` kullanımından `variant="strip"` KULLANMAYAN tek dosya bu sayfa (page.tsx:26-31, 4 × 279×136px kart, 4\'lü ızgara), `icon={<…/>}` geçen tek yer yine bu dört kart (4/154). /bakim/oee, /depo/stok, /muhasebe/faturalar, /satin-alma/siparisler, /ihracat/sevkiyatlar hepsi KpiStripRow + 80px strip. Aynı modülde iki KPI dili + uygulamada eşi olmayan süs ikonları → tutarlılık ve ikon disiplini kriterleri 5 olamaz. k3=4 (tableTop 352px, 13/36 satır ilk ekranda), k6=4 (aynı satırda iki sıfır kuralı), k7=4 (iskelet KPI 104px ≠ gerçek 136px, araç çubuğu yer tutucusu yok) — üçü de Tur 3 ile birebir aynı ölçüldü. Toplam 55 < 57 (Linear) → KAZANAN: Linear. Yakınsama (§7): iki yeni bulgu P1 açıldı; kapandığında k10+k11 5\'e çıkar → 57 = referans.';
R['/bakim/makineler']!.open.push(
  {
    id: 'bakim-makineler-05',
    criterion: 11,
    severity: 'P1',
    text: 'KPI şeridi uygulamanın tek istisnası: sayfa KpiCard\'ı varsayılan `card` varyantıyla 4\'lü ızgarada kullanıyor (279×136px kutu, içinde ~%45 boş alan). Uygulamadaki diğer bütün KPI\'lar KpiStripRow + variant="strip" (80px, dikey hairline ayraç) — /bakim/oee dahil. Aynı modülde iki farklı KPI dili; kutular tabloyu 352px\'ye itiyor.',
    measure: 'Tur 4: `grep -rn "<KpiCard" apps/web/src` → 154 kullanım; `variant="strip"` içermeyen tek dosya apps/web/src/app/(app)/bakim/makineler/page.tsx:27-30. Geometri: kart 279×136px @top=152, tablo @top=352, ilk ekranda 13/36 satır.',
    target: 'KpiStripRow + variant="strip" (kart yüksekliği 80px, dikey hairline ayraç) → tableTop ≤ 300px, ilk ekranda ≥ 15 satır',
    file: 'apps/web/src/app/(app)/bakim/makineler/page.tsx:26-31',
    openedRound: 4,
  },
  {
    id: 'bakim-makineler-06',
    criterion: 10,
    severity: 'P1',
    text: 'KPI kartlarında süs ikonu: Cog / Gauge / Wrench / AlertTriangle sağ üst köşede duruyor ve etiketin ("Toplam makine", "Çalışıyor", "Arızalı", "Vadesi geçen bakım") taşımadığı hiçbir bilgi taşımıyor. Uygulamadaki 154 KpiCard kullanımı içinde `icon=` geçen tek yer bu dört kart.',
    measure: 'Tur 4: `<KpiCard` toplam 154 kullanım, `icon={<` geçen 4 kullanım — dördü de apps/web/src/app/(app)/bakim/makineler/page.tsx:27-30. Başka hiçbir modülde KPI ikonu yok.',
    target: 'KPI kartlarında ikon yok (icon prop\'u kaldırılır) — uygulamanın geri kalanıyla birebir aynı KPI anatomisi',
    file: 'apps/web/src/app/(app)/bakim/makineler/page.tsx:27-30',
    openedRound: 4,
  },
);
for (const f of R['/bakim/makineler']!.open) {
  if (['bakim-makineler-01', 'bakim-makineler-02', 'bakim-makineler-03', 'bakim-makineler-04'].includes(f.id as string)) {
    f.measure = String(f.measure).replace(/^Tur 3/, 'Tur 4 (yeniden ölçüldü, Tur 3 ile aynı)');
  }
}

// --- /bakim/planlar
R['/bakim/planlar']!.round = 4;
R['/bakim/planlar']!.scoreNotes =
  'Tur 4: düzeltme uygulanmadı; ölçümler tekrarlandı ve Tur 3 ile aynı — kök scrollWidth 1440 = clientWidth 1440, iç kap taşması 0, kesik başlık 0, 12 satır × 36px, mobil kart 63.5px, 44px altı gerçek dokunma hedefi 0 (yalnızca breadcrumb metni), distinctColors 17/15. Tek açık P2 iskelet (k7=4). Toplam 59 ≥ 57 → KAZANAN: Plantero.';
R['/bakim/planlar']!.open[0]!.measure = 'Tur 4 (yeniden ölçüldü): loading.tsx 6 × h-9 + araç çubuğu yer tutucusu yok; gerçek 12 satır (36px) + 32px araç çubuğu — değişmedi';

// --- /bakim/is-emirleri
R['/bakim/is-emirleri']!.round = 4;
R['/bakim/is-emirleri']!.scoreNotes =
  'Tur 4: düzeltme uygulanmadı; üç açık P2 yeniden ölçüldü, üçü de aynı. k4=4 (distinctColors 27 — modülün en yükseği; tek satırda Tür+Öncelik+Durum üç renkli rozet sütunu), k7=4 (kanban 5 sütunun 4\'ü 50px başlık şeridi, boş durum yer tutucusu yok), k12=4 (kanban kart başlıkları scrollWidth 483/365/319 > 244 kırpılıyor). Liste tablosu taşmasız (1440=1440), mobil kart 62-64.5px. Toplam 57 = referans (Linear 57), hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';
for (const f of R['/bakim/is-emirleri']!.open) f.measure = String(f.measure).replace(/^Tur 3/, 'Tur 4 (yeniden ölçüldü, Tur 3 ile aynı)');

// --- detay route'ları: builder\'ın Tur 4 kapanışları kritik tarafından doğrulandı
R['/bakim/is-emirleri/[id]']!.round = 4;
R['/bakim/is-emirleri/[id]']!.scoreNotes =
  'Tur 4 (kritik doğrulaması, MO-2026-000006 / 00705ae3-eff2-44e9-a854-21fc8efc8535): kök scrollWidth 1440=1440 @1440x900 ve 390=390 @390x844, iç kap taşması 0, 44px altı gerçek dokunma hedefi 0 (yalnızca breadcrumb metni), distinctColors 22/21, h1 24/600 (mobilde 20/600), gövde 13px baskın. İskelet (loading.tsx) gerçek bölüm düzeniyle eşleşiyor (alan grupları + açıklama kartı + olay geçmişi + sabit eylem çubuğu). Detay bileşenleri (DetailFieldGroupsGrid/DetailFields) ana-veri modülüyle ortak → k11=5. 12/12 kriter 5, toplam 60 ≥ 57, açık bulgu yok → KAZANAN: Plantero.';
R['/bakim/makineler/[id]']!.round = 4;
R['/bakim/makineler/[id]']!.scoreNotes =
  'Tur 4 (kritik doğrulaması, MK-001 / 14c098fa-df2f-443f-9e61-7d50b7de02c3): kök scrollWidth 1440=1440 ve 390=390, iç kap taşması 0, 44px altı gerçek dokunma hedefi 0, distinctColors 19/18, sekme şeridi mobilde yatay kayan (taşma yok), OEE sparkline dönem uçlarını etiketliyor. İskelet gerçek sayfanın ince-satır dilini yansıtıyor (gri dolgulu kutu yok). 12/12 kriter 5, toplam 60 ≥ 57, açık bulgu yok → KAZANAN: Plantero.';

// --- /bakim/is-emirleri/yeni
R['/bakim/is-emirleri/yeni']!.round = 4;
R['/bakim/is-emirleri/yeni']!.scoreNotes =
  'Tur 4: düzeltme uygulanmadı. k3=4 (1. adımda contentBottom 337px, emptyBelow 563px @1440x900 — Tur 3 ile aynı), k11=4 (h1 sol kenarı 552px, modülün diğer dört route\'unda 264px). Mobil akış kusursuz: 390=390, tek kolon, 44px altı gerçek dokunma hedefi 0, tarama input\'u 56px. Toplam 58 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';
for (const f of R['/bakim/is-emirleri/yeni']!.open) f.measure = String(f.measure).replace(/^Tur 3/, 'Tur 4 (yeniden ölçüldü, Tur 3 ile aynı)');

// --- /bakim/oee
R['/bakim/oee']!.round = 4;
R['/bakim/oee']!.scores = [5, 5, 4, 5, 5, 5, 4, 4, 4, 5, 5, 5];
R['/bakim/oee']!.total = 56;
R['/bakim/oee']!.scoreNotes =
  'Tur 4 delta: k7 5→4 — yükleme iskeleti ilk kez ölçüldü (scripts/probe-bakim-r4-oee-skel.ts): iskelet 4 × 128×80 blok @top=144 + grafikler @top=248; gerçek sayfa çip satırı (h=32) @top=144 + 5 × 231×80 KPI @top=200 + grafik kartları @top=304 → 56px dikey sıçrama, KPI sayısı ve genişliği yanlış, çip satırı yer tutucusu yok. k3=4 (contentBottom 639, emptyBelow 262 — aynı), k8=4 (hat çiplerinde active/data-pressable yok — kod doğrulandı), k9=4 (mobil KPI şeridi scrollWidth 792 > 358, 3. kart kesik). distinctColors 14/12 (modülün en düşüğü), KPI 80px + dikey hairline, rakamlar tabular-nums. Toplam 56 = referans (Stripe 56), hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';
for (const f of R['/bakim/oee']!.open) f.measure = String(f.measure).replace(/^Tur 3/, 'Tur 4 (yeniden ölçüldü, Tur 3 ile aynı)');
R['/bakim/oee']!.open.push(
  {
    id: 'bakim-oee-05',
    criterion: 7,
    severity: 'P2',
    text: 'Yükleme iskeleti gerçek düzenle hizalanmıyor: hat filtresi çip satırı iskelette hiç yok, KPI blokları 4 adet ve 128px geniş (gerçek 5 adet, 231px), grafik kartları iskelette 56px yukarıda başlıyor → içerik gelince blok blok sıçrama.',
    measure: 'Tur 4 (scripts/probe-bakim-r4-oee-skel.ts): iskelet blokları top=144 → 4×(128×80), grafikler top=248; gerçek: çipler top=144 h=32, KPI top=200 → 5×(231×80), grafik kartları top=304 (763px + 373px). Fark 56px.',
    target: 'iskelet: çip satırı yer tutucusu (h=32) + tam genişlik 5\'li 80px KPI şeridi; grafik kartı üst kenarı gerçek sayfayla ±8px',
    file: 'apps/web/src/app/(app)/bakim/oee/loading.tsx',
    openedRound: 4,
  },
  {
    id: 'bakim-oee-06',
    criterion: 5,
    severity: 'P2',
    text: 'OEE trend grafiğinde dört serinin üçü aynı renkte çiziliyor; yalnızca kesik çizgi deseniyle ayrışıyorlar, tooltip\'te ise üçünün de noktası birebir aynı gri — ayrım tamamen metin etiketine kalıyor. (Kriter 5\'in ölçüm tanımı — tablo/kart anatomisi — karşılandığı için puan düşürülmedi; grafik anatomisi iyileştirmesi.)',
    measure: 'oee-charts.tsx:22 COMPONENT_COLOR = var(--muted-foreground); satır 68-70 availability/performance/quality üçü de stroke=COMPONENT_COLOR strokeOpacity=0.85, strokeDasharray sırasıyla yok / "4 3" / "1 3"; TrendTooltip (satır 36) noktayı `backgroundColor: p.color` ile basıyor → 3 seri aynı renk noktada.',
    target: 'her seri tooltip\'te ve gösterge çubuğunda ayırt edilebilir olsun (nötr rampada üç farklı ton ya da noktanın çizgi desenini yansıtması)',
    file: 'apps/web/src/modules/maintenance/components/oee-charts.tsx:22,36,68-70',
    openedRound: 4,
  },
);

writeFileSync(path, JSON.stringify(card, null, 1) + '\n');
console.log('yazıldı:', path);
for (const [r, v] of Object.entries(card.routes)) console.log(r, v.total, v.verdict, 'open:', v.open.map((o) => `${o.id}/${o.severity}`).join(', '));

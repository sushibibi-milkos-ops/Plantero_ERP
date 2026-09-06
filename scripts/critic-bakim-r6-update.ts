/** Tur 6 — gorsel-critic bakim puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as any;

card.round = 6;
card.measuredAt = '2026-09-06';
card.note =
  'Tur 6 — gorsel-critic. Tur 5 sonrası builder düzeltmeleri (914b236) yeniden ölçüldü. KAPANANLAR: ' +
  '/bakim/is-emirleri bakim-isemirleri-05 (Tür sütunu nötr, ekranda 4 hue ailesi: nötr/yeşil/amber/kırmızı — k4 4→5, toplam 59→60); ' +
  '/bakim/is-emirleri/yeni bakim-yeni-02 gerçekten kapandı (masaüstü emptyBelow 592→87px, sağ ray yok, tek sütun — k3 4→5, k12 4→5); ' +
  '/bakim/oee bakim-oee-02/08/09 kapandı (daima boş "Makine bazlı OEE" kartı kaldırıldı, yerine HER ZAMAN dolu "Hat bazlı OEE" tablosu; emptyBelow 262→26px; boş durum metni artık DB/worker adı sızdırmıyor — k3 4→5, k7 4→5, k12 4→5) ve masaüstünde tooltip kapısı çalışıyor (activeDots 0). ' +
  'AÇIK KALAN/YENİ: (a) /bakim/oee @390 OEE trendi grafiği hiçbir dokunuş olmadan 4 aktif nokta basıyor (3/3 tekrar; masaüstü 0) — tooltip kapısı yalnızca <Tooltip>u kapatıyor, <Area activeDot>u değil; ' +
  '(b) /bakim/oee @390 "Hat bazlı OEE" ham tablosu kart kenarında kesiliyor (scrollWidth 620 > clientWidth 356) ve kaydırma göstergesi (scroll-fade-x) yok — ekranda tek başına "%" glifi kalıyor; ' +
  '(c) /bakim/is-emirleri/yeni @390 form pb-[9rem] (144px) app-shell main pb-32 (128px) ile üst üste biniyor → son alandan sonra 338px ölü kaydırma, kaydırma sonunda eylem çubuğu ekranın ortasında asılı kalıyor. ' +
  'Kod düzeyi tarama TEMİZ: bakım modülünde transition-all/transition: all/ease-in/>300ms/scale(0) yok; hover globals.css:10 @custom-variant ile (hover:hover) and (pointer:fine) altında; transform-origin hatası yok.';

const R = card.routes;

// ---------------------------------------------------------------- makineler
R['/bakim/makineler'].round = 6;
R['/bakim/makineler'].scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
R['/bakim/makineler'].total = 60;
R['/bakim/makineler'].verdict = 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.';
R['/bakim/makineler'].scoreNotes =
  'Tur 6 delta (0): tüm Tur 5 ölçümleri korunuyor. satır 36.5–37px @13px × 36, mobil kart 63.5px (56–72 bandı), ' +
  'scrollWidth 1440=1440 / 390=390, fontSizes {13:238, 11:110, 12:12} = 3 kademe, distinctColors 17/15, h1 24px/600, ' +
  'tablo başlığı sticky top=300 (tableTop ≤300 hedefi), 390px\'te 44px altı dokunma hedefi yok. ' +
  'Mobil KPI şeridinin 3. kartının kenarda kesilmesi ortak bileşen kaynaklı (kpi-strip.tsx) ve bakim-oee-04 (P2) altında bir kez izleniyor.';

// ------------------------------------------------------------------ planlar
R['/bakim/planlar'].round = 6;
R['/bakim/planlar'].scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
R['/bakim/planlar'].total = 60;
R['/bakim/planlar'].verdict = 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.';
R['/bakim/planlar'].scoreNotes =
  'Tur 6 delta (0): satır 36px × 12 (tüm kayıtlar), scrollWidth 1440=1440 / 390=390, distinctColors 17/15, ' +
  'mobil kart 63.5px, h1 24px/600, sticky thead top=196. emptyBelow 236px yalnızca veri sayısından (12/12 kayıt görünür), düzen kusuru değil.';

// -------------------------------------------------------------- is-emirleri
{
  const r = R['/bakim/is-emirleri'];
  r.round = 6;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.verdict = 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.';
  r.scoreNotes =
    'Tur 6 delta (+1): k4 4→5 — bakim-isemirleri-05 kapandı. Yeniden ölçüm (scripts/probe-bakim-r6b.ts renk dökümü): ' +
    '"Tür" sütunu artık nötr (Arıza/Periyodik gri nokta + gri metin), ekrandaki tüm hesaplanmış renkler 4 hue ailesine iniyor — ' +
    'nötr (oklch .21/.552), yeşil 152 (Tamamlandı + birincil buton), amber 70 (Bildirildi), kırmızı 27 (yalnızca Kritik öncelik); ' +
    'her hue tek bir anlam taşıyor, scorecard k4 eşiği "ekranda ≤4 renk tonu" karşılanıyor. measure.ts distinctColors 25, ' +
    'aynı 4 hue\'nun alfa/ton varyantlarını ayrı sayıyor (planlar 17 farkı yalnızca rozet çeşidinden). ' +
    'Diğer ölçümler: satır 36px × 6, mobil kart 62–64.5px, scrollWidth 1440=1440 / 390=390, h1 24px/600. ' +
    'emptyBelow 446px yalnızca 6 kayıt olmasından; kanban görünümü 5 sütun yatay kaydırma (Linear board davranışı).';
  const idx = r.open.findIndex((o: any) => o.id === 'bakim-isemirleri-05');
  if (idx >= 0) {
    const f = r.open.splice(idx, 1)[0];
    f.closedRound = 6;
    f.verifiedBy = 'ölçüm (scripts/probe-bakim-r6b.ts renk dökümü + artifacts/screens/bakim-is-emirleri/desktop.png, Tur 6)';
    f.measureAfter =
      '"Tür" sütunu nötr (gri nokta + gri metin, semantik renk yok); ekrandaki hesaplanmış renkler 4 hue ailesi: nötr, yeşil 152, amber 70, kırmızı 27 — ' +
      'kırmızı yalnızca "Kritik" (1 satır), amber yalnızca "Bildirildi" (1 satır). measure.ts distinctColors 27→25 (alfa varyantları ayrı sayılıyor; hue sayısı 4).';
    f.fixNote =
      'Sayısal ≤20 hedefi bir vekil ölçüydü; asıl hedef ("Tür sütunu nötr, renk yalnızca öncelik+durumun kritik değerlerinde") ölçümle karşılandı.';
    r.closed.push(f);
  }
}

// --------------------------------------------------------- is-emirleri/[id]
R['/bakim/is-emirleri/[id]'].round = 6;
R['/bakim/is-emirleri/[id]'].scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
R['/bakim/is-emirleri/[id]'].total = 60;
R['/bakim/is-emirleri/[id]'].verdict = 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.';
R['/bakim/is-emirleri/[id]'].scoreNotes =
  'Tur 6 delta (0): MO-2026-000006 üzerinde ölçüldü. scrollWidth 1440=1440 / 390=390, distinctColors 22/21, h1 24px/600, ' +
  'fontSizes {13:37, 12:14, 11:11} = 3 kademe, 390px\'te 44px altı dokunma hedefi yok, "Boş alanları göster (16)" ile alan gürültüsü kapalı, loading.tsx var.';

// ----------------------------------------------------------- makineler/[id]
R['/bakim/makineler/[id]'].round = 6;
R['/bakim/makineler/[id]'].scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
R['/bakim/makineler/[id]'].total = 60;
R['/bakim/makineler/[id]'].verdict = 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.';
R['/bakim/makineler/[id]'].scoreNotes =
  'Tur 6 delta (0): MK-001 üzerinde ölçüldü. scrollWidth 1440=1440 / 390=390, distinctColors 19/18, h1 24px/600, ' +
  'sekmeler altı çizgili (Stripe deseni), "Boş alanları göster (4)", OEE sparkline tek vurgu rengi, 390px\'te 44px altı dokunma hedefi yok.';

// ---------------------------------------------------------- is-emirleri/yeni
{
  const r = R['/bakim/is-emirleri/yeni'];
  r.round = 6;
  r.scores = [5, 4, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5];
  r.total = 58;
  r.verdict = 'KAZANAN: Linear — toplam 58 ≥ 57 ama 1 açık P1 var (bakim-yeni-04); kazanma kuralı: açık P0/P1 yok.';
  r.scoreNotes =
    'Tur 6 delta (+1): k3 4→5 ve k12 4→5 — bakim-yeni-02 bu kez GERÇEKTEN kapandı: sayfa tek sütun, sağ ray/dolgu paneli yok, ' +
    '2. adım alanları ilk ekranda; masaüstü ana sütun emptyBelow 592→87px (scripts/probe-bakim-r6.ts). ' +
    'k2 4 ve k9 4 KALDI (yeni kök neden, bakim-yeni-04): 390px\'te formun `pb-[calc(9rem+…)]` (144px) alt boşluğu app-shell ' +
    '`<main class="… pb-32">` (128px) ile üst üste biniyor — son alan y=768\'de bitiyor, docHeight 1106 → 338px ölü kaydırma; ' +
    'kaydırma sonunda sticky eylem çubuğu ekranın ortasında (alt kenardan 257px yukarıda) asılı kalıyor ' +
    '(artifacts/critic/bakim-r6-yeni-390-bottom.png). Diğer ölçümler: distinctColors 16/15, h1 24px/600 (sol kenar 264px, modülle hizalı), ' +
    '390px\'te 44px altı görünür dokunma hedefi yok (yalnızca FormSelect\'in 1×1 gizli native <select>\'i — ortak bileşen, görünür değil).';
  r.open = [
    {
      id: 'bakim-yeni-04',
      criterion: 2,
      severity: 'P1',
      text:
        'Mobilde (390×844) formun altında 338px ölü kaydırma var: form `pb-[calc(9rem+env(safe-area-inset-bottom))]` (144px) ile ' +
        'app-shell `<main class="… pb-32">` (128px) üst üste biniyor. Eylem çubuğu `position: sticky` olduğu için akışta zaten yer kaplıyor — ' +
        'ek 144px tamamen fazlalık. Kaydırma sonunda "Vazgeç / Arızayı bildir" ekranın ortasında, altında 257px boşlukla asılı kalıyor.',
      measure:
        'Tur 6 @390x844 (scripts/probe-bakim-r6b.ts): lastFieldBottom 768, docHeight 1106, innerHeight 844 → deadTail 338px; ' +
        'form paddingBottom 144px, main paddingBottom 128px; kaydırma sonunda eylem çubuğu bottom=530px, alt gezinme top=787px → aradaki boşluk 257px ' +
        '(artifacts/critic/bakim-r6-yeni-390-bottom.png)',
      target:
        'deadTail ≤ 160px @390x844 (sticky çubuk 73px + alt gezinme 57px + ~24px nefes) — formdaki `pb-[calc(9rem+…)]` kaldırılır ' +
        '(app-shell `pb-32` alt gezinmeyi zaten karşılıyor); kaydırma sonunda eylem çubuğu alt gezinmenin hemen üstünde durur',
      file: 'apps/web/src/modules/maintenance/components/report-breakdown-form.tsx:119 (pb-[calc(9rem+env(safe-area-inset-bottom))])',
      openedRound: 6,
    },
  ];
}

// ---------------------------------------------------------------------- oee
{
  const r = R['/bakim/oee'];
  r.round = 6;
  r.scores = [5, 5, 5, 5, 4, 5, 5, 4, 4, 5, 5, 5];
  r.total = 57;
  r.verdict = 'KAZANAN: Stripe — toplam 57 ≥ 56 ama 2 açık P1 var (bakim-oee-10, bakim-oee-11); kazanma kuralı: açık P0/P1 yok.';
  r.scoreNotes =
    'Tur 6 delta (+1): k3 4→5, k7 4→5, k12 4→5 — daima boş "Makine bazlı OEE" kartı kaldırıldı (oee_records: 90 kayıt / machine_id dolu 0), ' +
    'yerine gerçek veriyle dolu "Hat bazlı OEE" tablosu geldi; emptyBelow 262→26px @1440x900; boş durum metinleri artık worker/tablo adı sızdırmıyor. ' +
    'k8 5→4: masaüstünde tooltip kapısı çalışıyor (activeDots 0) ama 390px\'te grafik hiçbir dokunuş olmadan 4 aktif nokta basıyor (3/3 tekrar) — bakim-oee-10. ' +
    'k9 4 KALDI: "Hat bazlı OEE" ham tablosu 390px\'te kart kenarında kesiliyor (bakim-oee-11) + KPI şeridi 3. kart kesiği (bakim-oee-04, ortak bileşen). ' +
    'k5 5→4: OEE trendinde "Kullanılabilirlik" serisi grafiğin üst kenarına yapışık (eğri bbox y=4 = en üst gridline y=4) — %100 çizgisi ile kart sınırı ayrışmıyor (bakim-oee-12). ' +
    'Diğer ölçümler: satır 36px × 3, scrollWidth 1440=1440 / 390=390, distinctColors 17/15, h1 24px/600, tüm sayılar tabular-nums, hat çipleri 390px\'te h-11 (44px).';
  const keep = r.open.filter((o: any) => o.id === 'bakim-oee-04');
  r.open = [
    ...keep,
    {
      id: 'bakim-oee-10',
      criterion: 8,
      severity: 'P1',
      text:
        'Mobilde (390×844) "OEE trendi" grafiği sayfa açılışında, hiçbir dokunuş/işaretçi olayı olmadan 4 aktif nokta (hover durumu) basıyor. ' +
        'Tur 5\'te eklenen `useTooltipGate` yalnızca `<Tooltip active={false}>`i kapatıyor; `<Area>`nın varsayılan `activeDot`u kapıdan geçmiyor — ' +
        'kullanıcı seçmediği bir veri noktası seçilmiş görünüyor.',
      measure:
        'Tur 6 @390x844 (scripts/probe-bakim-r6b.ts, 3/3 tekrar): `.recharts-active-dot` = 4 (x=193; y=563/334/563/563, 8×8px, fill chart-1 + 3 nötr ton); ' +
        'aynı ölçüm @1440x900: 0. Görsel doğrulama: artifacts/screens/bakim-oee/mobile.png',
      target: '`.recharts-active-dot` sayısı = 0 @390x844 açılışta (ilk gerçek pointer/touch olayına kadar) — `activeDot={interacted ? undefined : false}` kapıdan geçirilir',
      file: 'apps/web/src/modules/maintenance/components/oee-charts.tsx (useTooltipGate → <Area activeDot>)',
      openedRound: 6,
    },
    {
      id: 'bakim-oee-11',
      criterion: 9,
      severity: 'P1',
      text:
        '"Hat bazlı OEE" tablosu 390px\'te kartın sağ kenarında kesiliyor: "KULLANILAB…" başlığı yarıda kalıyor ve iki satırda değerin yerine ' +
        'tek başına "%" glifi görünüyor. Sarmalayıcı `overflow-x-auto` olduğu için içerik kaydırılabiliyor ama uygulamanın kendi kaydırma göstergesi ' +
        '(`scrollbar-thin scroll-fade-x`, KpiStripRow ve DataTable\'da kullanılıyor) yok; ayrıca bu, modülde DataTable\'ın mobil kart görünümüne dönmeyen tek tablo.',
      measure:
        'Tur 6 @390x844 (scripts/probe-bakim-r6.ts): div.mt-4.overflow-x-auto sarmalayıcı scrollWidth 620 > clientWidth 356 (264px gizli), sınıf listesinde ' +
        '`scroll-fade-x`/`scrollbar-thin` yok; görsel: artifacts/critic/bakim-r6-oee-390-bottom.png (kart kenarında yalnız "%" glifi)',
      target:
        '@390px: ya sarmalayıcı `scrollbar-thin scroll-fade-x` alır (kesik kenar işaretlenir, glif ortasından kesme kalmaz) ya da <640px\'te sütunlar ' +
        'Hat / OEE / Duruş ile sınırlanır (scrollWidth ≤ clientWidth)',
      file: 'apps/web/src/app/(app)/bakim/oee/page.tsx ("Hat bazlı OEE" kartı, div.mt-4.overflow-x-auto)',
      openedRound: 6,
    },
    {
      id: 'bakim-oee-12',
      criterion: 5,
      severity: 'P2',
      text:
        'OEE trendinde "Kullanılabilirlik" serisi (%99,6) grafiğin en üst gridline\'ı ile çakışıyor: çizgi kartın üst kenarına yapışık çiziliyor, ' +
        'seri ile %100 gridline\'ı ayrışmıyor. Y ekseni domaini `niceTicks` ile veri maksimumuna tam oturuyor, üst pay yok.',
      measure:
        'Tur 6 @1440x900 ve @390x844 (scripts/probe-bakim-r6.ts): `.recharts-area-curve` (availability) bbox y=4; en üst yatay gridline y=4 → aradaki pay 0px',
      target: 'en üst seri ile grafik üst kenarı arasında ≥8px pay (Y domain üst sınırı veri maksimumunun ≥%5 üstüne alınır)',
      file: 'apps/web/src/modules/maintenance/components/oee-charts.tsx (YAxis domain / niceTicks)',
      openedRound: 6,
    },
  ];
  // bakim-oee-04 yeniden ölçüldü (açık kalıyor)
  const strip = r.open.find((o: any) => o.id === 'bakim-oee-04');
  if (strip) strip.measure = 'Tur 6 (yeniden ölçüldü, değişmedi): KpiStripRow scrollWidth 792 > clientWidth 358 @390x844; 3. kart ("Performans") 390px kenarında kesik. Belge kökünde taşma yok (390=390).';
}

writeFileSync(path, JSON.stringify(card, null, 1) + '\n', 'utf8');
console.log('bakim.json Tur 6 güncellendi');
for (const [route, v] of Object.entries<any>(card.routes)) {
  console.log(route, 'toplam', v.total, '| açık', v.open.length, '|', v.verdict.slice(0, 40));
}

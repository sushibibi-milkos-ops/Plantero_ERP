/** Tur 10 kritik puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). Yalnızca artifacts/critic/bakim.json'u yazar. */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(PATH, 'utf8'));
const R = 10;

card.round = R;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 10: 7 rotanın tamamı yeniden çekildi (pnpm shot) ve ölçüldü (artifacts/critic/measure-bakim-r10/*.json, scripts/probe-bakim-r10{,b,c,d,e}.ts). Tur 9\'un açık tek bulgusu (bakim-oee-04, P2, shell/kpi-strip.tsx) yeniden ölçüldü ve AÇIK kaldı (390px: KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan 2\'si tam görünür). İKİ YENİ BULGU: (1) bakim-makineler-07 (P1, kriter 6) — /bakim/makineler mobil kartında metrik yuvası ETİKETSİZ tamsayı ("0"), kartın tam metni "MK-001 / Boşta / Ön ezme (…) / 0"; "Sonraki bakım" tarihi mobilde hiç basılmıyor, oysa aynı modüldeki /bakim/planlar aynı yuvaya kendini açıklayan tarihi koyuyor. (2) shell-mobile-card-action-gutter-01 (P2, ortak bileşen mobile-cards.tsx) — /bakim/is-emirleri mobil listesinde satır aksiyonu olan tek kartta rozetin sağ kenarı 313px, diğer 5 kartta 363px (50px tırtıklı rozet sütunu); kök neden shell, bakım modülünde YENİDEN AÇILMADI, yalnızca kriter 5 puanına yansıtıldı. Ayrıca ölçüldü (bulgu açılmadı, kriter puanına yansıdı): iş emri detayındaki OrderTimeline noktalarında "Yapılıyor" oklch(0.55 0.16 152) ile "Tamamlandı" oklch(0.6 0.16 152) aynı hue/chroma, ΔL 0.05 — bakim-isemirleri-detay-12 (P2). Kod taraması TEMİZ: bakım modülünde transition-all / transition: all / ease-in / scale(0) / ≥300ms süre / origin-* hatası YOK; tek hareket `transition-transform group-hover:scale-105` (doğru özellik, hover\'lı) ve `animate-spin`/`motion-safe:animate-pulse`; `hover:` varyantı globals.css:10\'da @media (hover:hover) and (pointer:fine) ile global olarak korunuyor.';

function setRoute(key: string, patch: Record<string, unknown>) {
  const r = card.routes[key];
  if (!r) throw new Error(`route yok: ${key}`);
  Object.assign(r, { round: R }, patch);
}

setRoute('/bakim/makineler', {
  scores: [5, 5, 5, 5, 5, 4, 5, 5, 4, 5, 5, 5],
  total: 58,
  verdict: 'Linear',
  scoreNotes:
    'Tur 10 delta (−1): k6 5→4. Gerekçe (yeni ölçüm, scripts/probe-bakim-r10b.ts + probe-bakim-r10e.ts + artifacts/critic/bakim-r10-makineler-390-cards.png): 390px mobil kartın metrik yuvasında ETİKETSİZ, BİRİMSİZ bir tamsayı duruyor — kartın tam innerText\'i "MK-001\\nBoşta\\nÖn ezme (ezme makinesi, parçalama hazneli)\\n0"; 36/36 kartta aynı. Masaüstünde bu sayıya anlamı "Açık iş emri" sütun başlığı veriyor, mobilde başlık yok. Aynı hareketin ikinci yarısı: "Sonraki bakım" (nextDueAt) mobil kartta HİÇ basılmıyor (hasDate false, 3/3 kart) — kardeş rota /bakim/planlar aynı yuvaya kendini açıklayan tarihi (08.09.2026 / 14.09.2026 …) koyuyor, yani doğru desen modül içinde zaten var. k9 4 kalır (KPI şeridi @390 scrollWidth 792 > 358 — kök neden shell/kpi-strip.tsx, bakim-oee-04 altında bir kez izleniyor). Değişmeyen ölçümler: satır 36,5–37px × 36 @13px, mobil kart 63,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px\'te 44px altı görünür dokunma hedefi yok, alt başlık↔metrik boşluğu 8px. Toplam 58 ≥ 57 ama açık P1 var → KAZANAN: Linear.',
  open: [
    {
      id: 'bakim-makineler-07',
      criterion: 6,
      severity: 'P1',
      text:
        '390px mobil kartın metrik yuvası etiketsiz/birimsiz tamsayı basıyor ("0" — Açık iş emri). Mobilde sütun başlığı olmadığından sayı okunamaz; aynı hamlede operasyonel olarak en değerli alan olan "Sonraki bakım" tarihi karttan tamamen düşüyor (DataTableMobileCards yalnızca `rest` listesinin SONUNCUSUNU basar; machines-table.tsx sıralamasında sonuncu openOrderCount).',
      measure:
        'scripts/probe-bakim-r10b.ts @390x844: kart metin düğümleri = ["MK-001" 14px, "Ön ezme (…)" 12px, "Öğütücü" 0×0 (hidden md:block), "0" 13px @x355-363]; li.innerText = "MK-001\\nBoşta\\nÖn ezme (ezme makinesi, parçalama hazneli)\\n0"; /\\d{2}\\.\\d{2}\\.\\d{4}/ eşleşmesi 0/3 kart. Karşılaştırma: /bakim/planlar aynı yuvada 12/12 kartta tarih basıyor (probe-bakim-r10e.ts).',
      target:
        'Mobil kart metrik yuvasında etiketsiz çıplak tamsayı kalmasın: (a) machines-table.tsx "openOrderCount" sütununa meta.mobile:\'hidden\' verilip "nextDueAt" `rest` listesinin sonuncusu yapılır (metrik = 14.09.2026, kendini açıklayan, gecikmede AlertTriangle + text-destructive ile), ya da (b) hücre birimli basılır ("0 iş emri"). Kabul: 390px kartın innerText\'inde ya dd.MM.yyyy tarih bulunur ya da metrik değeri birim/etiket taşır; hiçbir kartta yalnız duran tamsayı kalmaz.',
      file: 'apps/web/src/modules/maintenance/components/machines-table.tsx:35-57 (nextDueAt / openOrderCount sütun meta\'ları)',
      openedRound: 10,
    },
  ],
});

setRoute('/bakim/planlar', {
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  verdict: 'Plantero',
  scoreNotes:
    'Tur 10 delta 0. Yeniden ölçüm: satır 36px × 12 @13px, mobil kart 63,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:94, 12:21, 11:14}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px\'te 44px altı görünür dokunma hedefi yok. Mobil kart metrik yuvası 12/12 kartta "Sonraki" tarihini basıyor (kendini açıklayan), alt başlık↔metrik boşluğu 12/12 kartta 8px — modülün doğru referans deseni bu rota (bkz. bakim-makineler-07). Bu rotada KPI şeridi yok — k9 5 kalır. Satır aksiyonu 12/12 kartta var, rozet sütunu tırtıklı değil.',
  open: [],
});

setRoute('/bakim/is-emirleri', {
  scores: [5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5],
  total: 59,
  verdict: 'Plantero',
  scoreNotes:
    'Tur 10 delta (−1): k5 5→4. Gerekçe (yeni ölçüm, scripts/probe-bakim-r10b.ts @390x844): mobil kart listesinde rozet sütunu tırtıklı — satır aksiyon menüsü YALNIZCA açık iş emrinde render edildiğinden (MO-2026-000006) o kartta rozetin sağ kenarı 313px, diğer 5 kartta 363px; 6 kartlık listede 50px\'lik hizasızlık. Kök neden ORTAK bileşen (components/data-table/mobile-cards.tsx satır 1: başlık/rozet/aksiyon flex\'inde aksiyon için ayrılmış sabit oluk yok) → shell-mobile-card-action-gutter-01 (P2) olarak shell\'e yazılır, bu modülde bulgu AÇILMADI (DESIGN-SCORECARD kural 5). Kazanmayı engellemez: toplam 59 ≥ 57, hiçbir kriter <4, bakım modülünde açık P0/P1 yok. Değişmeyen ölçümler: masaüstü satır 36px × 6 (veri tabanında 6 iş emri var, tümü ilk ekranda), mobil kart 62–64,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), h1 24px/600 (mobil 20px/600), 390px\'te 44px altı görünür dokunma hedefi yok. Renk disiplini doğrulandı (k4 5): kind/priority tonları labels.ts PRIORITY_TONE ile bilinçli olarak nötrlenmiş (yalnızca critical=danger), tek vurgu + durum renkleri.',
  open: [],
});

setRoute('/bakim/is-emirleri/[id]', {
  scores: [5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 59,
  verdict: 'Plantero',
  scoreNotes:
    'Tur 10 delta (−1): k4 5→4. Gerekçe (yeni ölçüm, scripts/probe-bakim-r10d.ts): "Olay geçmişi" zaman çizgisinde 3 olayın 2\'si aynı rengi taşıyor — "Yapılıyor" (tone primary) oklch(0.55 0.16 152) ve "Tamamlandı" (tone success) oklch(0.6 0.16 152): hue 152 ve chroma 0,16 BİREBİR aynı, yalnızca L 0,05 fark; 10×10px noktada göz ayırt etmiyor. Aynı çakışmayı status-badge.tsx `work_order` için zaten özel-durum olarak çözmüş (kendi yorumunda "aynı yeşil aileden … neredeyse ayırt edilemez"), maintenance kind\'ında çözmemiş. Bulgu bakim-isemirleri-detay-12 (P2) — kazanmayı engellemez, çünkü noktanın yanındaki metin etiketi ("Yapılıyor"/"Tamamlandı") anlamı zaten tek başına taşıyor; renk kanalı yedek. Değişmeyen ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, fontSizes {13:47, 12:24, 11:18}, h1 24px/600 (mobil 20px/600), 390px\'te 44px altı görünür dokunma hedefi yok, fotoğraf döşemesi 270×299px (md:grid-cols-4).',
  open: [
    {
      id: 'bakim-isemirleri-detay-12',
      criterion: 4,
      severity: 'P2',
      text:
        'OrderTimeline noktalarında iki farklı durum aynı renge düşüyor: "Yapılıyor" (maintenance.in_progress → tone primary) ve "Tamamlandı" (maintenance.done → tone success) globals.css\'te aynı yeşil ailedendir. Zaman çizgisinin tek görsel kodlaması nokta rengi olduğu için renk kanalı bilgi taşımıyor.',
      measure:
        'scripts/probe-bakim-r10d.ts (/bakim/is-emirleri/<id>, 1440x900): noktalar → Bildirildi oklch(0.72 0.17 70), Yapılıyor oklch(0.55 0.16 152), Tamamlandı oklch(0.6 0.16 152); son ikisi Δhue 0, Δchroma 0, ΔL 0,05; nokta boyutu 10×10px.',
      target:
        'Aynı listede yan yana görünen iki durum aynı hue ailesini paylaşmasın: `in_progress` ya farklı hue\'ya alınır (ör. tone \'info\' = oklch(0.6 0.15 250)) ya da status-badge.tsx\'teki work_order deseninin karşılığı uygulanır (devam eden = içi dolu + motion-safe:animate-pulse, tamamlanan = içi boş halka). Kabul: zaman çizgisindeki iki nokta arasında Δhue ≥ 40 ya da dolgu/halka anatomisi farkı ölçülebilir olsun.',
      file: 'apps/web/src/modules/maintenance/components/order-timeline.tsx:6-8 (DOT_CLASS) + apps/web/src/lib/status.ts:262 (maintenance.in_progress tone)',
      openedRound: 10,
    },
  ],
});

setRoute('/bakim/makineler/[id]', {
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  verdict: 'Plantero',
  scoreNotes:
    'Tur 10 delta 0. Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes {13:37, 14:8, 11:9, 12:9}; "Son iş emirleri" bağlantı satırları 44px (min-h-11), sekme şeridi mobilde yatay kaydırma + kenar soldurma ile ("Özellikler/Bakım planları (1)/İş emirleri (1)/Duruşlar (0)/OEE trendi/Fotoğraflar (0)"), 390px\'te 44px altı görünür dokunma hedefi yok. Bu rotada KPI şeridi yok — k9 5 kalır. Boş bölüm metinleri yerinde ("Duruş kaydı yok."). Kod: fotoğraf döşemesinde `transition-transform group-hover:scale-105` — doğru özellik, hover globals.css:10 ile (hover:hover)+(pointer:fine) altında korunuyor.',
  open: [],
});

setRoute('/bakim/is-emirleri/yeni', {
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  verdict: 'Plantero',
  scoreNotes:
    'Tur 10 delta 0. Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), fontSizes {13:30, 14:4, 11:3}. 390px\'te 44px altı TEK dokunma hedefi FormSelect\'in 1×1 gizli native <select>\'i (ortak bileşen, görünmez — gerçek tetikleyici 36px+ ve tam genişlik). Mobil akış doğru sırada: QR okuyucu → "veya listeden seçin" → tek kolon form → yapışkan aksiyon çubuğu (buton 44px). Bu rotada KPI şeridi yok — k9 5 kalır.',
  open: [],
});

setRoute('/bakim/oee', {
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5],
  total: 59,
  verdict: 'Plantero',
  scoreNotes:
    'Tur 10 delta 0. bakim-oee-04 (P2, kök neden shell/kpi-strip.tsx) yeniden ölçüldü ve AÇIK kaldı: @390x844 KpiStripRow scrollWidth 792 > clientWidth 358, 5 kartın (152px) yalnızca 2\'si tam görünür (probe-bakim-r10.ts). Aynı ekranda ikinci yatay kaydırma bölgesi "Hat bazlı OEE" tablosu (wrapper scrollWidth 588 > clientWidth 324, 6 sütundan 2\'si görünür) — ama bu, Tur 6\'da bakim-oee-11 kapsamında bilinçli olarak `scrollbar-thin scroll-fade-x` göstergesiyle çözülmüş, uygulama genelindeki (kanban-board, document-chain, data-table) taşan-tablo deseniyle birebir aynı desendir; yeni bulgu AÇILMADI, k9\'un 4\'te kalmasının ikinci gerekçesi olarak not edildi. Doğrulanan ölçümler: masaüstü scrollWidth 1440=1440, mobil 390=390 (overflowX false), tablo satırı 36px × 3, distinctColors 17/15, h1 24px/600 (mobil 20px/600). Renk/seri disiplini (k4 5, k5 5): 4 seri tek vurgu + nötr rampayla ayrışıyor — OEE oklch(0.55 0.16 152) 2px düz, Kullanılabilirlik oklch(0.552 0.016 285.9/0.9) 1px düz, Performans /0.62 dash 4,3, Kalite /0.4 dash 1,3; Pareto çubukları tek renk (vurgu). "Hat bazlı OEE" hücreleri tabular-nums + sağ hizalı, OEE<60 yalnızca destructive.',
  open: [
    ...card.routes['/bakim/oee'].open.map((o: Record<string, unknown>) => ({
      ...o,
      measure:
        'Tur 10 yeniden ölçüm (scripts/probe-bakim-r10.ts, 390x844): KpiStripRow scrollWidth 792 > clientWidth 358, kart genişlikleri [152,152,152,152,152], tam görünen kart 2/5 — Tur 9 ile birebir aynı, değişmedi.',
    })),
  ],
});

writeFileSync(PATH, JSON.stringify(card, null, 2) + '\n');
console.log('yazıldı:', PATH);
for (const [k, v] of Object.entries<Record<string, unknown>>(card.routes)) {
  console.log(' ', k, 'toplam', v.total, 'ref', v.referenceTotal, v.verdict, 'açık:', (v.open as unknown[]).length);
}

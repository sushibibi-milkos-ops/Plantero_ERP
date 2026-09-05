/** Tur 5 kritik geçişi — artifacts/critic/bildirimler.json güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'artifacts/critic/bildirimler.json');
const card = JSON.parse(readFileSync(file, 'utf8')) as any;
const prevOnaylar = card.routes['/onaylar'];
const prevBildirimler = card.routes['/bildirimler'];

card.round = 5;
card.note =
  'Tur 5 (kritik geçişi). /onaylar: Tur 4 P1 onaylar-18 ÖLÇÜMLE KAPANDI — 390px titleWidth 133→306px, kırpık başlık 11/14→1/13 (kalan tek kırpma 56 karakterlik tedarikçi adı), satır 67px, mobil 2. hat rozet+tutar; masaüstünde regresyon yok (satır 40-41px, titleWidth 869, 0 kırpma). Kriter 1: 4→5 (onaylar-17 hedefi "≤4 kademe" ölçümle karşılandı: main içi görünür kademeler {24,14,13,11}; 14px yalnızca ortak Button/PageHeader açıklaması — shell.json\'da kasıtlı uygulama geneli konvansiyon olarak belgeli), kriter 9: 4→4 (P1 kapandı ama iki yeni ölçülebilir P2 var: mobil 2. hatta tutar satır sağ kenarından 144,8px önce bitiyor; sekme şeridi scrollW 410 > clientW 358 ve kaydırma göstergesi yok). Toplam 57→58 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → /onaylar KAZANDI. /bildirimler: bildirimler-p2-focus KAPANDI (satır odak halkası artık boxShadow ring 2px inset primary/50, outline none — tarayıcı varsayılanı değil), bildirimler-p2-reltime KAPANDI (ölçüm yeniden üretilemiyor: 390px\'te zaman damgası 72,7px = satırın %20\'si, başlıklar tek satır ve kırpılmıyor). Kriter 3: 4→4 gerekçe değişti (satır 88→71,5px ile mobil kart hedefi 56-72 karşılandı, ancak masaüstünde de 71,5px satır + 768px kolon → 900px viewport\'ta ~11 satır; Linear gelen kutusu aynı yükseklikte ~14-16 satır gösterir — yeni P2 bildirimler-12), kriter 8: 4→5 (odak halkası + hover ölçümle doğrulandı). Toplam 57→58 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → /bildirimler KAZANDI (Tur 3-4 kararı korunuyor). Kod taraması temiz: modül dosyalarında transition-all / ease-in / >300ms / scale(0) yok; hover globals.css @custom-variant ile (hover:hover) and (pointer:fine) altında; :active scale(0.97) :not(:focus-visible) ile klavye aktivasyonundan muaf; prefers-reduced-motion bloğu var; scrollIntoView({block:"nearest"}) smooth değil. Ölçümler: artifacts/critic/measure-bildirimler-r5/*.json + probe-bildirimler-r5{,b,c,d,e}.json. NOT: /bildirimler admin hesabında boştur; dolu durum `--as depo` (3 kayıt), boş durum admin ile ölçüldü; /onaylar boş durumu `--as kalite` ile doğrulandı.';

const now = new Date().toISOString();

card.routes['/onaylar'] = {
  round: 5,
  reference: 'linear',
  referenceTotal: 57,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 4, 5],
  total: 58,
  previousTotal: 57,
  winner: 'plantero',
  measuredAt: now,
  measurements: {
    desktop1440x900: {
      rowCount: 13,
      rowHeights: 'seçili 181,5px + 12x40-41px',
      titleWidth: 868.8,
      truncatedTitles: 0,
      amountWidth: 112,
      amountTabular: 'tabular-nums',
      overflowX: false,
      scrollWidth: 1440,
      clientWidth: 1440,
      listWidth: 1152,
      mainVisibleFontSteps: [24, 14, 13, 11],
      h1: { size: 24, weight: 600 },
      tabHeights: [32, 32, 32],
      buttonHeights: [36, 36, 36],
      hover: 'rgba(0,0,0,0) → oklab(.955 …/.2)',
      selectedRowFocus: 'boxShadow ring oklab(0.55 -0.1412 …) (2px inset), outline none',
      keyboardJ: 'seçim 0→1, aria-selected + document.activeElement satırda',
      distinctColorsMain: 13,
    },
    mobile390x844: {
      rowCount: 13,
      rowHeights: 'seçili 215,5px + 12x66-67px',
      titleWidth: 306,
      truncatedTitles: '1/13 (EFT — Kahve Dünyası Yeşil Kahve ve Egzotik Ürünler Ltd. Şti.)',
      amountWidth: 112,
      amountRightGap: 144.8,
      overflowX: false,
      scrollWidth: 390,
      clientWidth: 390,
      touchTargetsBelow44: 0,
      tabHeights: [44, 44, 44],
      buttonHeights: [44, 44, 44],
      tablist: { scrollWidth: 410, clientWidth: 358, maxScroll: 52, firstTabX: 18 },
      mainPaddingBottom: 128,
      fixedBottomNavHeight: 57,
      mainVisibleFontSteps: [20, 14, 13, 11],
    },
    emptyStateKalite: { rows: 0, text: 'Onay bekleyen kayıt yok / Yeni bir taslak, sayım farkı ya da mutabakat önerisi oluştuğunda burada görünür. / Mutabakat panosuna git', boxWidth: 1152 },
    loadingSkeleton: 'onaylar/loading.tsx: 13x Skeleton h-11 (44px) / sm:h-10 (40px) — masaüstü gerçeğiyle (40-41px) örtüşüyor, mobil gerçeğiyle (67px) örtüşmüyor',
  },
  scoreDeltas: {
    '1': '4→5: onaylar-17 hedefi ("≤4 kademe") ölçümle karşılandı — main içi görünür kademeler {24,14,13,11}; 14px yalnızca ortak Button + PageHeader açıklaması (shell.json: uygulama geneli kasıtlı konvansiyon, ayrı bulgu değil). İçerik hiyerarşisi 24/13/11 net.',
    '9': '4→4: onaylar-18 (P1) kapandı — mobil başlık 133→306px, kırpma 11/14→1/13, dokunma hedefleri 44px, mainPaddingBottom 128px > sabit alt gezinme 57px. 5 olmasını iki ölçülebilir P2 engelliyor: onaylar-19 (2. hatta tutar satır sağ kenarından 144,8px önce bitiyor — satırın %40\'ı boş) ve onaylar-20 (sekme şeridi taşıyor, kaydırma göstergesi yok).',
    '11': '4→4: bildirimler-10 (tablist ortak ui/tabs.tsx yerine iki modülde elle yazılmış) hâlâ açık; kök neden ortak bileşende (justify-center + flex-1 taşan şeritte ilk sekmeyi kalıcı kırpıyor), modül kapatamaz.',
    other: 'değişmedi (gerileme yok): 2,3,4,5,6,7,8,10,12',
  },
  open: [
    {
      id: 'onaylar-19',
      criterion: 9,
      severity: 'P2',
      openedRound: 5,
      text: 'Mobil (<sm) satırın 2. hattında tutar sabit w-28 kutusunda duruyor ve satırın sağ kenarına hizalanmıyor — her satırda sağda 144,8px (satır genişliğinin %40\'ı) boş kalıyor; rozet+tutar sola yığılıyor, Linear/Stripe mobil liste kalıbında sayı sağ kenara yaslanır.',
      measure: '390x844: amountRightGap = 144,8px (13/13 satır), satır iç genişliği 358px, tutar kutusu 112px.',
      target: 'amountRightGap ≤ 16px (ör. tutar span\'ine `ml-auto sm:ml-0`, masaüstündeki 40px tek hat düzeni ve `w-28` hizası korunarak).',
      file: 'apps/web/src/modules/notifications/components/approval-queue.tsx:216-226',
    },
    {
      id: 'onaylar-20',
      criterion: 9,
      severity: 'P2',
      openedRound: 5,
      text: 'Mobilde sekme şeridi taşıyor ve taştığına dair hiçbir görsel ipucu yok (scrollbar gizli, kenar maskesi yok): "Satın alma taslağı (2)" sekmesi 390px\'te sağ kenarda yarıda kesiliyor, kullanıcı kaydırılabildiğini göremiyor. (Şerit gerçekten kaydırılabiliyor — kalıcı kırpma hatası YOK.)',
      measure: '390x844: tablist scrollWidth 410 > clientWidth 358, maxScroll 52px, son sekmenin sağ kenarı x=424 (viewport 390); scrollbar-width:none.',
      target: 'Sağ kenarda 24px `mask-image` gradyanı ya da aktif sekme değişince `scrollIntoView({inline:"nearest"})`; taşma varlığı 390px\'te görsel olarak belli olsun.',
      file: 'apps/web/src/modules/notifications/components/approval-queue.tsx:149',
    },
    {
      id: 'onaylar-21',
      criterion: 7,
      severity: 'P2',
      openedRound: 5,
      text: 'Yükleniyor iskeleti mobil satır yüksekliğiyle uyumsuz: iskelet satırı 44px (h-11), gerçek satır 67px (Tur 4\'te satır 2 hatta açıldı, iskelet güncellenmedi) — 13 satırda ~299px\'lik yerleşim sıçraması. Masaüstünde uyumlu (40 vs 40-41px).',
      measure: 'onaylar/loading.tsx: `h-11 rounded-none sm:h-10`; ölçülen gerçek satır: 390px\'te 66-67px, 1440px\'te 40-41px.',
      target: 'İskelet satırı mobilde 64-68px (ör. `h-[67px] sm:h-10`); |iskelet − gerçek| ≤ 4px.',
      file: 'apps/web/src/app/(app)/onaylar/loading.tsx:19',
    },
  ],
  closedThisRound: [
    { id: 'onaylar-18', closedRound: 5, verifiedBy: 'ölçüm (probe-bildirimler-r5.json)', measureAfter: '390x844: titleWidth 306px (hedef ≥220), truncatedTitles 1/13 (hedef ≤3/14), satır 66-67px, overflowX=false; 1440x900: titleWidth 868,8px, 0 kırpma, satır 40-41px (regresyon yok).' },
  ],
};

card.routes['/bildirimler'] = {
  round: 5,
  reference: 'linear',
  referenceTotal: 57,
  scores: [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 4, 5],
  total: 58,
  previousTotal: 57,
  winner: 'plantero',
  measuredAt: now,
  measurements: {
    desktop1440x900: {
      rowCount: 3,
      rowHeights: [72, 72, 71],
      listWidth: 768,
      mainWidth: 1200,
      titleFont: '13px/500 (okunmamış) — /onaylar satır başlığıyla birebir aynı',
      bodyFont: '13px, line-clamp-2',
      timeFont: '11px tabular-nums',
      overflowX: false,
      h1: { size: 24, weight: 600 },
      mainVisibleFontSteps: [24, 14, 13, 11],
      hover: 'rgba(0,0,0,0) → oklab(.955 …/.4)',
      rowFocus: 'boxShadow ring oklab(0.55 -0.1412 …) 2px inset, outline none (Tur 4\'te tarayıcı varsayılanı 1px auto idi)',
      iconSize: 16,
      distinctColors: 17,
    },
    mobile390x844: {
      rowHeights: [72, 72, 71],
      listWidth: 358,
      titleWidths: [112, 170.6, 167.9],
      titleLines: 1,
      timeWidth: 72.7,
      timePctOfRow: 20,
      touchTargetsBelow44: 0,
      tabHeights: [44, 44],
      markAllButton: { h: 44, w: 207.1 },
      overflowX: false,
      mainPaddingBottom: 128,
      fixedBottomNavHeight: 57,
    },
    emptyStateAdmin: { hasList: false, boxWidth: 768, boxHeight: 290, text: 'Henüz bildiriminiz yok / Yeni bir bildirim geldiğinde burada görünür. / Onay Merkezi\'ne git' },
    loadingSkeleton: 'bildirimler/loading.tsx: 3x Skeleton h-[88px] — gerçek satır 71,5px (bkz. bildirimler-11)',
  },
  scoreDeltas: {
    '3': '4→4 (gerekçe değişti): Tur 4\'ün gerekçesi (satır 88px > 72px mobil kart hedefi) KAPANDI — satır 71,5px. Yeni gerekçe: aynı 71,5px masaüstünde de geçerli ve kolon 768px ile sınırlı; 900px viewport\'ta ~11 satır görünüyor, Linear gelen kutusu aynı yükseklikte ~14-16 satır gösterir (yeni P2 bildirimler-12).',
    '8': '4→5: satır odak halkası artık projenin dili (boxShadow ring 2px inset primary/50, outline none) — Tur 4\'te tarayıcı varsayılanı (outline 1px auto) ölçülmüştü; hover (bg accent/40) + iyimser okundu işaretleme + toast doğrulandı (bildirimler-p2-focus kapandı).',
    '1': 'değişmedi (5): görünür kademeler {24,14,13,11}; sr-only tür etiketleri 16px ama ekranda görünmüyor (clip), kademe saymıyor.',
    other: 'değişmedi (gerileme yok): 2,4,5,6,7,9,10,11,12',
  },
  open: [
    {
      id: 'bildirimler-10',
      criterion: 11,
      severity: 'P2',
      openedRound: 4,
      text: 'Tablist ortak `ui/tabs.tsx` yerine iki modül dosyasında elle yazılmış (karakter-birebir kopya). Font kısmı Tur 4\'te kapandı (satır başlığı 13px/500 = /onaylar). Kod tekilliği hedefi ortak bileşendeki hata (justify-center + TabsTrigger flex-1, taşan şeritte ilk sekmeyi kalıcı kırpıyor) giderilmeden kapanamaz — shell.',
      measure: 'Tur 5: notifications-list.tsx:84-103 ve approval-queue.tsx:149-165 aynı deseni ayrı ayrı taşıyor; ölçülen sekme yükseklikleri her iki ekranda da 44px (mobil) / 32px (masaüstü) — görsel fark YOK, yalnızca kod tekilliği açık.',
      target: 'İki ekran da tek ortak tablist bileşeninden beslensin (ortak `ui/tabs.tsx` taşma hatası düzeltildikten sonra).',
      file: 'apps/web/src/modules/notifications/components/notifications-list.tsx:84 + approval-queue.tsx:149 (kök neden: apps/web/src/components/ui/tabs.tsx)',
    },
    {
      id: 'bildirimler-11',
      criterion: 7,
      severity: 'P2',
      openedRound: 5,
      text: 'Yükleniyor iskeleti satır yüksekliği gerçeğiyle uyuşmuyor: iskelet 88px, gerçek satır 71,5px — her yüklemede liste ~50px kısalıyor (3 satır x 16,5px).',
      measure: 'bildirimler/loading.tsx:20 `h-[88px]`; ölçülen gerçek satır 71-72px (1440x900 ve 390x844).',
      target: 'İskelet satırı 72px (`h-[72px]`); |iskelet − gerçek| ≤ 4px.',
      file: 'apps/web/src/app/(app)/bildirimler/loading.tsx:20',
    },
    {
      id: 'bildirimler-12',
      criterion: 3,
      severity: 'P2',
      openedRound: 5,
      text: 'Masaüstünde besleme yoğunluğu düşük: satır 71,5px (başlık + 2 satır line-clamp gövde) ve kolon 768px ile sınırlı — 900px viewport\'ta ~11 satır sığıyor; referans gelen kutusu aynı yükseklikte 14-16 satır gösterir. Kolonun sağındaki 432px (main genişliğinin %36\'sı) hiçbir şeye ayrılmamış.',
      measure: '1440x900: rowHeights [72,72,71], listWidth 768, mainWidth 1200, ilk ekranda sığan satır ≈ 11.',
      target: 'Masaüstünde satır ≤ 64px (ör. gövde md+ ekranda `line-clamp-1`, mobilde 2 satır kalsın) → ilk ekranda ≥ 12 satır; ya da 768px kolonun sağındaki alan bir işe yarasın (seçili bildirim detayı).',
      file: 'apps/web/src/modules/notifications/components/notifications-list.tsx:112-136',
    },
    {
      id: 'bildirimler-p2-severity',
      criterion: 4,
      severity: 'P2',
      openedRound: 4,
      text: 'SKT GEÇMİŞ (gerçekleşmiş kayıp) ile SKT UYARI (60 gün) görsel olarak birebir aynı: aynı Clock4 ikonu, aynı muted renk, aynı okunmamış noktası — ciddiyet sinyali yalnızca metinde.',
      measure: 'Tur 5 ölçümü: 3 satırın 3\'ünde de ikon rengi oklch(0.552 0.016 285.9), boyut 16px — distinctTypeStyles = 1.',
      target: 'Geçmiş SKT için destructive, 30 gün için warning tonlu ikon/rozet (StatusBadge token\'ları); distinctTypeStyles ≥ 2.',
      file: 'apps/web/src/modules/notifications/components/notifications-list.tsx:18-27,127 + packages/core/src/notifications/systemAlerts.ts',
    },
  ],
  closedThisRound: [
    { id: 'bildirimler-p2-focus', closedRound: 5, verifiedBy: 'ölçüm (probe-bildirimler-r5b.json)', measureAfter: 'Satır bağlantısı odaklandığında: outlineStyle=none, boxShadow = ring oklab(0.55 -0.1412 …) 2px inset — /onaylar kuyruk satırıyla aynı odak dili.' },
    { id: 'bildirimler-p2-reltime', closedRound: 5, verifiedBy: 'ölçüm (probe-bildirimler-r5e.json)', measureAfter: '390x844: zaman damgası 72,7px = satır genişliğinin %20\'si (iddia %40); başlıklar 112-171px, tek satır, kırpma yok — ölçüm yeniden üretilemiyor.' },
  ],
};

// Geçmiş kapanışlar korunur; bu turun kapanışları listeye eklenir.
for (const [key, prev] of [['/onaylar', prevOnaylar], ['/bildirimler', prevBildirimler]] as const) {
  const route = card.routes[key];
  route.closed = [...(prev.closed ?? []), ...route.closedThisRound];
  delete route.closedThisRound;
}
writeFileSync(file, JSON.stringify(card, null, 1));
console.log('güncellendi:', file, '\nround:', card.round, '\n/onaylar total:', card.routes['/onaylar'].total, '\n/bildirimler total:', card.routes['/bildirimler'].total);

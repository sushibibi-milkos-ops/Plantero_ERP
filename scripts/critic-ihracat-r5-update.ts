/** Tur 5 kritik: artifacts/critic/ihracat.json puan kartını güncelle (geçmiş korunur). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Finding = Record<string, unknown>;
const file = resolve(process.cwd(), 'artifacts', 'critic', 'ihracat.json');
const card = JSON.parse(readFileSync(file, 'utf8')) as {
  module: string; round: number; note: string; measurements?: unknown;
  routes: Record<string, { round: number; scores: number[]; total: number; reference: string; scoreNotes?: string; open: Finding[]; closed: Finding[] }>;
  crossModule: Finding[]; shipmentIdUsed?: string;
};

card.round = 5;
card.shipmentIdUsed = '4c6b1223-5347-46af-ade1-30d586193715 (EXP-2026-000002, gümrükte) · 87dcd322 (000001, kapalı) · e935d55d (000003, taslak)';
card.note =
  'Tur 5 (bağımsız kritik). Veritabanı yeniden tohumlandı (sevkiyat id\'leri değişti), 6 rota + detayın 4 sekmesi 3 farklı sevkiyat durumunda (taslak/gümrükte/kapalı) yeniden çekildi ve ölçüldü. ' +
  'Tur 4\'ün açtığı 4 bulgunun tamamı yeniden ölçülerek KAPATILDI: sipariş seçici artık "€216,00" (tr-TR, 2 basamak, 12px muted) basıyor; boş form gönderiminde tetikleyici aria-invalid=true + destructive kenarlık alıyor, odak alana taşınıyor, mesaj placeholder\'dan farklı ("İhracat siparişi seçilmedi"); GTİP tablosunda Kategori/Tip tekrarı gitti (Tip 2 farklı değer taşıyor); 390px sevkiyat kartının meta zinciri kırpılmıyor. ' +
  'Tur 5\'te ilk kez ölçülen 3 yüzey (gümrük diyaloğu, taslak sevkiyat paneli, mobil kur kartı) 3 yeni bulgu doğurdu; biri (gümrük diyaloğu) P1 olduğu için /ihracat/sevkiyatlar/[id] kazanamadı. 6 rotanın 5\'i kazandı.';

const R = card.routes;

function close(routeKey: string, id: string, verifiedBy: string) {
  const r = R[routeKey]!;
  const idx = r.open.findIndex((o) => o.id === id);
  if (idx >= 0) { const [f] = r.open.splice(idx, 1); r.closed.push({ ...f!, closedRound: 5, verifiedBy }); }
}

// --- /ihracat/sevkiyatlar
R['/ihracat/sevkiyatlar'] = {
  ...R['/ihracat/sevkiyatlar']!,
  round: 5,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  scoreNotes:
    'Tur 4→5: 59 → 60. Kriter 9: 4→5 — ihracat-sevk-03 (mobil kart meta zinciri iki yerden kırpılıyordu) kapandı: 390x844 ölçümde scrollWidth=clientWidth=390, kart yüksekliği 63,5px (56–72 bandı), 44px altı dokunma hedefi YOK (yalnızca etkileşimsiz breadcrumb metni). Diğer 11 kriter değişmedi: satır 36px, 13px gövde, h1 24/600, ekranda 22 farklı renk (rozet+durum noktaları dahil), €/₺ sütunları tabular-nums ve sağ hizalı, sıfır tutar (€0,00) soluk, filtreli boş durum "Eşleşen kayıt yok + Arama ya da filtreleri değiştirmeyi deneyin", satır hover bg + pointer + 2px focus ring ölçüldü.',
  open: [],
};

// --- /ihracat/sevkiyatlar/[id]
const detay = R['/ihracat/sevkiyatlar/[id]']!;
detay.round = 5;
detay.scores = [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5];
detay.total = 58;
detay.scoreNotes =
  'Tur 4→5: 57 → 58. Kriter 7: 4→5 — Fatura & kur boş durumu artık var olmayan eyleme yönlendirmiyor (ikon + "Henüz bağlı fatura yok" + gerçek koşulu anlatan açıklama); taslak sevkiyatta Çeki listesi boş durumu da ekrandaki gerçek eylemi ("İrsaliyeye bağla" → "Çeki listesi oluştur") tarif ediyor. ' +
  'Kriter 6: 4\'te kaldı — detay-12 (miktarın iki ayrı biçimi) kapandı, kur 4 basamak/virgüllü tutarlı, ama taslak sevkiyatta aynı panelde sıfır sunumu tutarsız (yeni bulgu ihracat-detay-15: "€0,00" soluk oklab(.552/.7) iken "0 kap" tam kontrast oklch(0.21) 500). ' +
  'Kriter 11: 4\'te kaldı — detay-13 (MAEU-SEED takip no) kapandı ama ekranın birincil eylemi kendi diyaloğunda başka adla karşılıyor (yeni P1 ihracat-detay-14). Kalan kriterler ölçümle 5: satır 36px, sekme çubuğu 1152px, scrollWidth=clientWidth (1440 ve 390), mobil kart 63,5px, Belgeler sekmesinde başlık ve hücre aynı sütunda hizalı (th.left=1246 / rozet innerLeft=1258, aynı 130px sütun).';
detay.open = [
  {
    id: 'ihracat-detay-14',
    criterion: 11,
    severity: 'P1',
    text:
      'Sevkiyat detayının birincil eylemi kendi diyaloğunda BAŞKA bir adla ve yanlış zaman kipiyle karşılıyor. Durum "Gümrükte" iken düğme (shipment-actions.tsx:132) doğru şekilde "Gümrük bilgisini güncelle" yazıyor, ama açılan ConfirmDialog\'un başlığı "Gümrük işlemine al" (satır 108), onay düğmesi "Gümrüğe al" (satır 111) ve başarı toast\'ı "Gümrük işlemine alındı" (satır 113) — üçü de sabit, duruma bakmıyor. Üstelik alan boş açılıyor (useState(\'\') , satır 37) ve placeholder\'ı "GB2026000045", yani sevkiyatın 200px yanındaki "Proforma & gümrük" panelinde yazan GERÇEK beyanname numarasının aynısı: kullanıcı alanı dolu sanıp "Gümrüğe al"a basıyor, gönderilen değer null (çekirdek eski değeri koruduğu için veri kaybı yok, ama kullanıcı yanlış bilgilendiriliyor).',
    measure:
      '1440x900, EXP-2026-000002 (status=customs): tetikleyici metni "Gümrük bilgisini güncelle"; açılan [role=dialog] başlığı "Gümrük işlemine al", onay düğmesi "Gümrüğe al", açıklama "Standart rejimde gümrük beyanname numarası gerekli."; diyalogdaki tek input value="" (placeholder "GB2026000045" = shipment.customsDeclarationNo)',
    target:
      'Diyalog metinleri düğmeyle aynı ternary\'yi kullanmalı: status===\'customs\' iken title "Gümrük bilgisini güncelle", confirmLabel "Kaydet", toast "Gümrük bilgisi güncellendi"; alan mevcut değerle dolu açılmalı (customsDeclarationNo/etgbNo prop olarak geçilip useState(initial)) ve placeholder gerçek kayıtla birebir aynı olmayan jenerik bir örnek olmalı. Kabul ölçütü: tetikleyici metni ile diyalog başlığı aynı eylemi adlandırıyor; input.value === panelde yazan beyanname no.',
    file: 'apps/web/src/modules/export/components/shipment-actions.tsx:37,103-134',
    openedRound: 5,
  },
  {
    id: 'ihracat-detay-15',
    criterion: 6,
    severity: 'P2',
    text:
      'Aynı panelde sıfır değerler iki farklı ağırlıkta: "Proforma & gümrük" panelinde boş alanlar soluk "—", sıfır tutar soluk "€0,00", ama sıfır kap sayısı tam kontrastta gerçek bir değer gibi "0 kap" yazıyor. Ayrıca palet 0 olduğunda ikinci parça hiç basılmıyor, dolu sevkiyatta ise "1 kap · 1 palet" — aynı alan iki farklı gramere sahip.',
    measure:
      '1440x900, EXP-2026-000003 (taslak): "0 kap" color=oklch(0.21 0.006 285.9) weight=500; aynı paneldeki "€0,00" color=oklab(0.552 … / 0.7) weight=500; boş alanlar "—" color=oklch(0.552 0.016 285.9)',
    target:
      'packageCount 0/null iken alan diğer boş alanlarla aynı soluk "—" olmalı (ya da "0 kap · 0 palet" soluk renkte, tek gramer). Kabul ölçütü: panelde sıfır/boş tüm değerlerin rengi oklch(0.552 …).',
    file: 'apps/web/src/app/(app)/ihracat/sevkiyatlar/[id]/page.tsx:114',
    openedRound: 5,
  },
];
close('/ihracat/sevkiyatlar/[id]', 'nonexistent', 'n/a');

// --- /ihracat/sevkiyatlar/yeni
R['/ihracat/sevkiyatlar/yeni'] = {
  ...R['/ihracat/sevkiyatlar/yeni']!,
  round: 5,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  scoreNotes:
    'Tur 4→5: 55 → 60. Kriter 6: 3→5 — sipariş seçicinin AÇIK hâli yeniden ölçüldü: seçenek satırı artık iki parça, "SO-2026-000033 — BioGrün Handels GmbH" (13px, foreground) + "€216,00" (12px, muted) — ham DB sayısı (216.0000 EUR) gitti, seçim rozetiyle aynı biçim. ' +
    'Kriter 7: 4→5 — boş gönderimde tetikleyici aria-invalid="true" ve kenarlık destructive (oklch(0.577 0.245 27.3)) oluyor, hata metni "İhracat siparişi seçilmedi" placeholder\'dan ("Sipariş seçin") farklı. ' +
    'Kriter 8: 4→5 — hata anında odak alana taşınıyor (document.activeElement = #shipment-sales-order-trigger). ' +
    'Kriter 11: 4→5 — 6 metin alanının tamamında placeholder var ("Ör. İzmir FOB", "Ör. Hamburg Limanı", "Ör. Maersk", "Sevkiyatla ilgili not (opsiyonel)"). Ölçüm: 1440x900 alanlar 36px/378px çift kolon, 390x844 tek kolon + 44px alanlar, taşma yok.',
  open: [],
};

// --- /ihracat/belgeler
R['/ihracat/belgeler'] = {
  ...R['/ihracat/belgeler']!,
  round: 5,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  scoreNotes:
    'Tur 4→5: 60 → 60 (değişiklik yok). Yeniden ölçüm: 1440x900 satır 36px, 30 satır, scrollWidth=clientWidth=1440; 390x844 kart 60px, 44px altı dokunma hedefi yok; font kademeleri 13/12/11 + 24px h1; durum rozetleri tek boyutta.',
  open: [],
};

// --- /ihracat/kurlar
R['/ihracat/kurlar'] = {
  ...R['/ihracat/kurlar']!,
  round: 5,
  scores: [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 5, 5],
  total: 58,
  reference: 'stripe',
  scoreNotes:
    'Tur 4→5: 58 → 58. Kriter 3 (4): KPI şeridi 1152px\'in yalnızca ~380px\'ini kullanıyor, karşılaştırma deltası/sparkline yok — Stripe çıtasında bu alan "son 7 gün değişim" taşır. Kriter 6 (4): mobil kartın metrik yuvası etiketsiz (yeni P2 ihracat-kurlar-09). Kalanlar ölçümle 5: 1440 satır 36px/25 satır + sayfalama (1–25/180), kur 4 basamak tabular-nums, Y ekseni "₺42,0" tr-TR, Kaynak "TCMB" (seed son eki temiz), 390px taşma yok.',
  open: [
    {
      id: 'ihracat-kurlar-09',
      criterion: 6,
      severity: 'P2',
      text:
        'Mobilde kur kartının tek sayısı hangi kur olduğunu söylemiyor: masaüstü tabloda "Alış" ve "Satış" iki ayrı sütun, mobilde "Alış" mobile:\'hidden\' olduğu için kartta yalnızca satış kuru, etiketsiz duruyor. İki kur birbirine %0,5 yakın olduğundan kullanıcı hangisine baktığını ayırt edemiyor.',
      measure:
        '390x844 /ihracat/kurlar, ilk kart: title "EUR", subtitle "06.09.2026 · TCMB", metrik "₺37,4000" — kart metninde "Alış"/"Satış" sözcüğü geçmiyor; masaüstü aynı satırda Alış ₺37,2000 / Satış ₺37,4000',
      target:
        'Metrik yuvası etiketli olmalı: 11px muted "Satış" + değer (ya da kart alt satırında "Alış ₺37,2000 · Satış ₺37,4000"). Kabul ölçütü: 390px kart metninde gösterilen kurun adı geçiyor.',
      file: 'apps/web/src/modules/export/components/rates-table.tsx:35 (selling sütununda mobile meta\'sı yok)',
      openedRound: 5,
    },
  ],
};

// --- /ihracat/gtip
R['/ihracat/gtip'] = {
  ...R['/ihracat/gtip']!,
  round: 5,
  scores: [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 59,
  scoreNotes:
    'Tur 4→5: 59 → 59. ihracat-gtip-08 kapandı (Kategori sütunu kaldırıldı; kalan "Tip" sütunu 2 farklı değer taşıyor: Mamul/Hammadde — ölçüldü). Kriter 3 (4): "Ürün" sütunu 692px, tablonun %60\'ı; satır başına yalnızca 4 alan var, GTİP sütununun 38/39 satırı "Eşlenmedi" — ekranın bilgi yoğunluğu hâlâ Linear çıtasının altında. Kalanlar 5: satır 37px, ilk ekranda 17 satır (iç kaydırma kabı 644px), scrollWidth=clientWidth=1152, mobil kart 60px, 44px altı dokunma hedefi yok.',
  open: [],
};

// --- ortak bileşen (shell) bulguları
card.crossModule = [
  ...(card.crossModule || []).filter((f) => f.id !== 'shell-confirm-dialog-icon-01'),
  {
    module: 'shell',
    id: 'shell-confirm-dialog-icon-01',
    criterion: 10,
    severity: 'P2',
    text:
      'ConfirmDialog HER diyalogda uyarı üçgeni (lucide AlertTriangle) basıyor; yıkıcı olmayan diyaloglarda bu üçgen yeşil (primary) daire içinde çıkıyor. "Lojistik bilgilerini düzenle" gibi tarafsız bir düzenleme formu uyarı gliflisiyle, üstelik başarı rengiyle açılıyor — ikon anlam taşımıyor, renk de anlamla çelişiyor (yeşil = başarı/vurgu, üçgen = uyarı).',
    measure:
      '1440x900 /ihracat/sevkiyatlar/<id> → "Düzenle": diyalog başlığının solunda size-9 bg-primary/10 text-primary daire içinde AlertTriangle; aynı ikon "Gümrük işlemine al" ve tüm modüllerdeki onay diyaloglarında',
    target:
      'İkon eyleme göre: yıkıcı diyalogda AlertTriangle/destructive, tarafsız düzenlemede ikon YOK ya da eylemin ikonu (Pencil/ShipWheel) nötr renkte. Kabul ölçütü: yeşil daire + uyarı üçgeni kombinasyonu hiçbir diyalogda görünmüyor.',
    file: 'apps/web/src/components/confirm-dialog.tsx:4,72-80',
    openedRound: 5,
    not: 'Ortak bileşen kaynaklı — DESIGN-SCORECARD kural 5 gereği shell\'e yazılır, modüllerde tekrar açılmaz.',
  },
];

card.measurements = {
  round5: 'artifacts/critic/measure-ihracat-r5/*.json (6 rota × 1440x900 + 390x844), probe: scripts/probe-ihracat-r5{,b,c,d}.ts',
  screens: [
    'artifacts/screens/ihracat-sevkiyatlar/{desktop,mobile}.png',
    'artifacts/screens/ihracat-sevkiyatlar-4c6b1223-5347-46af-ade1-30d586193715/{desktop,mobile}.png',
    'artifacts/screens/ihracat-sevkiyat-detay-sekmeler-r5/*.png (gümrükte)',
    'artifacts/screens/ihracat-sevkiyat-kapali-r5/*.png (kapalı, faturalı)',
    'artifacts/screens/ihracat-sevkiyat-taslak-r5/*.png (taslak)',
    'artifacts/screens/ihracat-sevkiyatlar-yeni/{desktop,mobile}.png',
    'artifacts/screens/ihracat-belgeler/{desktop,mobile}.png',
    'artifacts/screens/ihracat-kurlar/{desktop,mobile}.png',
    'artifacts/screens/ihracat-gtip/{desktop,mobile}.png',
    'artifacts/critic/ihracat-r5-{gumruk,lojistik}-dialog-1440.png, ihracat-r5-gtip-select-1440.png, ihracat-r5-bos-sonuc-1440.png',
  ],
};

writeFileSync(file, JSON.stringify(card, null, 1) + '\n');
console.log('güncellendi:', file);
for (const [k, v] of Object.entries(card.routes)) console.log(k, v.total, JSON.stringify(v.scores), 'açık:', v.open.length);

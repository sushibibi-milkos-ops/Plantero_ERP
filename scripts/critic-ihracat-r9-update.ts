/**
 * Tur 9 kritik puan kartı güncellemesi — ihracat.
 * docs/DESIGN-SCORECARD.md kural 1-3: her açık bulgu yeniden ölçüldü (Tur 8'de hepsi kapanmıştı),
 * 12 kriter yeniden puanlandı, yeni bulgular yalnızca measure+target+criterion ile açıldı.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'artifacts/critic/ihracat.json';
const card = JSON.parse(readFileSync(PATH, 'utf8')) as any;

card.round = 9;
card.note =
  'Tur 9. Tur 8 sonrası ihracat modülünde hiçbir kaynak değişikliği yok (git log 55c5f05..HEAD -- modules/export, app/(app)/ihracat = boş); tek dolaylı değişiklik shell commit 3e870da (mobile-cards ayraç margin\'i + subtitle ellipsis + empty-state compact yüksekliği) — ihracat mobil kartlarında regresyon YOK, yeniden ölçüldü. 6 rotanın 6\'sı da yeniden çekildi (1440x900 + 390x844), measure + probe-ihracat-r9.ts ile ölçüldü, ekran görüntüleri Read ile incelendi. Tur 8\'in kapattığı bulgular yeniden doğrulandı: detay Belgeler sekmesi deadRightPx=0 (hem gümrükteki hem kapalı sevkiyatta), 4 tablonun sütun slack profili sağlıklı, kur "Günlük değişim" sütunu 25/25 satırda 2 ondalıklı ve slack 115. Kod taraması TEMİZ: modül dosyalarında transition-all / transition: all / ease-in / scale(0) / ≥300ms süre / transform-origin yok; tek animasyon fetch-rates-button.tsx\'teki animate-spin (yükleniyor göstergesi); tüm hover: sınıfları globals.css\'teki @custom-variant ile (hover:hover) and (pointer:fine) altında kapılı. Satır hover davranışı doğrulandı: tıklanabilir satırlar (sevkiyat listesi) hover\'da bg-accent/50 alıyor, tıklanamayanlar (belgeler/kurlar/gtip) almıyor — bu KASITLI ve doğru (hover tonu tıklanabilirlik sinyalidir), bulgu değil. Odak halkası 3px ring (oklch 0.55 0.16 152 / %50) mevcut. Koyu tema (kurlar) kontrol edildi: grafik çizgileri, kırmızı/yeşil delta ve hairline ayraçlar okunur. Sonuç: 6 rotanın 6\'sı da KAZANIYOR; açık P0/P1 yok. Açılan 3 yeni bulgu P2 (veri/doluluk kaynaklı ölü sütun ve ölü KPI) — kazanmayı engellemez, listelenir.';
card.measurements = {
  ...card.measurements,
  round9:
    'artifacts/critic/measure-ihracat-r9/*.json (6 rota × 1440x900 + 390x844, pnpm measure); sütun slack + tek-değerli sütun + sekme panel/tablo genişliği: scripts/probe-ihracat-r9.ts → artifacts/critic/probe-ihracat-r9.json; satır hover / medya sorgusu: scripts/probe-ihracat-r9b.ts; sekme ve boş-sonuç ekran görüntüleri: scripts/shot-ihracat-r9-tabs.ts → artifacts/screens/ihracat-r9-tabs/*.png; sevkiyat id\'leri db:reset sonrası canlı okundu (EXP-2026-000002 = 0f9035b9-a5c9-47c0-b4f9-05654a4ed910, EXP-2026-000001 = 424e3c84-1303-4e90-aa0c-745eaa824e0c).',
};

const R = card.routes;

R['/ihracat/sevkiyatlar'].round = 9;
R['/ihracat/sevkiyatlar'].scoreNotes =
  'Tur 8→9: 60 → 60 (değişiklik yok, kaynak da değişmedi). Yeniden ölçüldü (measure-ihracat-r9/sevkiyatlar-{1440,390}.json + probe-ihracat-r9.json): 1440x900 scrollWidth=clientWidth=1440, tablo 1152=kapsayıcı 1152, tbody 3/3 satır 36px, gövde 13px (49 düğüm), h1 24px/600, 22 renk; 10 sütunun slack profili sağlıklı (en geniş Durum 58px, medyan 26px, hiçbiri >58px), para sütunları sağa hizalı + tabular-nums, sıfır tutar (€0,00) soluk. 390x844: scrollWidth=clientWidth=390, kart 63,5px × 3, 44px altı etkileşimli hedef 0 (yalnız breadcrumb metni); meta zinciri tek segment, kırpma yok (shell 3e870da ayraç margin değişikliği sonrası regresyon yok). Yeni bulgu yok.';

R['/ihracat/sevkiyatlar/[id]'].round = 9;
R['/ihracat/sevkiyatlar/[id]'].probeId =
  '0f9035b9-a5c9-47c0-b4f9-05654a4ed910 (EXP-2026-000002, gümrükte) + 424e3c84-1303-4e90-aa0c-745eaa824e0c (EXP-2026-000001, kapalı/faturalı) — 4 sekme × 2 durum × (1440 + 390)';
R['/ihracat/sevkiyatlar/[id]'].scoreNotes =
  'Tur 8→9: 59 → 59 (delta yok). Kriter 5 = 5 DOĞRULANDI: Tur 8\'de kapatılan ihracat-detay-19 yeniden ölçüldü — Belgeler sekmesinde panel 1152 / tablo 1152 → deadRightPx = 0, hem gümrükteki (8 satır) hem kapalı (11 satır) sevkiyatta; Sipariş satırları ve Çeki listesi sekmelerinde de 0. Kriter 3 KASITLI olarak 4\'te kalıyor (Tur 8 gerekçesiyle aynı, yeniden ölçülerek): Belgeler sekmesindeki 5 sütunun 2\'si neredeyse tamamen boş — "Vade" 0/8 ve 0/11 satırda dolu (veritabanı genelinde export_documents.due_date 0/30), "Belge no" 1/8 ve 4/11; bu iki sütun 436px/1152px = tablonun %38\'i ve ekranda em-dash duvarı olarak okunuyor. Tur 8 bunu ölü sağ blok (P1) yerine bilinçli olarak seçmişti; kök neden artık ihracat-detay-20 (P2) olarak AÇIK. Diğer 10 kriter 5: DocumentChain 4 düğüm kendi para biriminde (€16.800,00 / ₺624.960,00) + "Devam belgesi yok" kesikli yer tutucusu, Fatura & kur sekmesinde Kur (TCMB) ₺37,2000 ve kur tarihi 07.09.2026 /ihracat/kurlar ile birebir, TL karşılığı 16.800 × 37,20 = ₺624.960,00 tutarlı, "Henüz bağlı fatura yok" boş durumu ikon+başlık+açıklama ile ve ekranda görünmeyen hiçbir eylemi adlandırmadan, 1440 ve 390\'da taşma yok (measure-ihracat-r9/detay-*.json: 1440=1440, 390=390), 390\'da 44px altı hedef yalnız breadcrumb metni + satır içi belge linki, 4 sekme de mobilde DataTable kart görünümünde.';
R['/ihracat/sevkiyatlar/[id]'].open = [
  {
    id: 'ihracat-detay-20',
    criterion: 3,
    severity: 'P2',
    text:
      'Sevkiyat detayının "Belgeler" sekmesinde tablonun %38\'i em-dash duvarı: "Vade" sütunu HİÇBİR satırda dolu değil (0/8 gümrükteki sevkiyatta, 0/11 kapalıda; export_documents.due_date veritabanı genelinde 0/30) ve "Belge no" 1/8 (kapalıda 4/11). Bu iki sütun Tur 8\'de bilinçli olarak varsayılan görünür yapılmıştı — amaç tabloyu 365px\'e büzülmekten kurtarmaktı (ihracat-detay-19, P1) — ama bu, ölü alanı tablonun SAĞINDAN sütunların İÇİNE taşıdı: kullanıcı 1152px\'lik tablonun 436px\'inde yalnızca "—" görüyor. Kök neden UI değil VERİ: takip tarihi (vade) ve sorumlu hiçbir belge için tohumlanmıyor, oysa ikisi de ConfirmDialog\'da düzenlenebilir gerçek alanlar.',
    measure:
      '1440x900, probe-ihracat-r9.json detay_customs["Belgeler__cols"] / detay_closed: Vade width=155 distinctValues=1 rowsWithText=8 (tümü "—"), Belge no width=281 dolu 1/8; kapalı sevkiyatta Vade width=156 dolu 0/11, Belge no width=278 dolu 4/11. İki sütun toplamı 436px / tablo 1152px = %37,8. Veritabanı: select count(due_date)=0, count(responsible_id)=0 from export_documents (n=30).',
    target:
      'Belgeler sekmesindeki her görünür sütun satırların en az %50\'sinde dolu olsun. Tercih edilen kök neden düzeltmesi: packages/db/src/seed/export.ts bekleyen belgelere gerçekçi vade (ör. ETD − 3 gün) ve sorumlu (ihracat@plantero.local) yazsın — bu aynı anda /ihracat/belgeler\'deki "Vadesi geçmiş" ve "Sorumlusuz" KPI\'larını da anlamlı kılar (bkz. ihracat-belgeler-04). Kabul ölçütü: probe-ihracat-r9.ts ile Vade sütununda rowsWithText/distinctValues oranı ≥ 2 ve dolu satır ≥ %50; deadRightPx 0 kalsın (ihracat-detay-19 regresyona uğramasın).',
    file: 'packages/db/src/seed/export.ts (export_documents.due_date / responsible_id) — alternatif: apps/web/src/modules/export/components/documents-table.tsx:sparseDefault',
    openedRound: 9,
  },
];

R['/ihracat/sevkiyatlar/yeni'].round = 9;
R['/ihracat/sevkiyatlar/yeni'].scoreNotes =
  'Tur 8→9: 60 → 60. Yeniden ölçüldü (measure-ihracat-r9/yeni-{1440,390}.json): 1440x900 scrollWidth=clientWidth=1440, h1 24/600, 13 renk, font kademesi 3 (13/14/24 + etiket); iki blok da max-w-3xl, sm:grid-cols-2 ızgara, 8 alanın 8\'inde örnek placeholder ya da varsayılan değer. 390x844: taşma yok (390=390), tek kolon, alt eylem çubuğu yapışkan (Vazgeç + Sevkiyat oluştur), 44px altı hedef yalnız breadcrumb metni ve shadcn Select\'in gizli 1×1 native <select> yedekleri (gerçek dokunma hedefi değil). Boş durum (uygun sipariş yok) ikon+başlık+açıklama+eylem ile hazır (shipment-create-form.tsx:96). Yeni bulgu yok.';

R['/ihracat/belgeler'].round = 9;
R['/ihracat/belgeler'].scoreNotes =
  'Tur 8→9: 60 → 60. Yeniden ölçüldü: 1440x900 scrollWidth=clientWidth=1440, tablo 1152=kapsayıcı, 30/30 satır 36px, gövde 13px (112 düğüm), h1 24/600, 20 renk; 5 sütunun slack profili ≤114 (Belge 110, Sevkiyat 75, Müşteri 114, Durum 104, Eylemler 10) — Tur 7\'de kapatılan ihracat-belgeler-03 regresyona uğramamış. 390x844: taşma yok, kart 60px × 30, 44px altı hedef 0. Filtrelenmiş boş durum özenli (ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin" + arama alanında × temizleme; artifacts/screens/ihracat-r9-tabs/belgeler-bos-sonuc.png). KPI sıfır tonu doğrulandı: "Vadesi geçmiş 0" değeri oklch(0.552 0.016 285.9) = muted, diğer üç KPI oklch(0.21 …) — kriter 6 sağlanıyor. Yeni bulgu ihracat-belgeler-04 (P2, kriter 3) — kazanmayı engellemez.';
R['/ihracat/belgeler'].open = [
  {
    id: 'ihracat-belgeler-04',
    criterion: 3,
    severity: 'P2',
    text:
      'KPI şeridinin 4 bloğundan 2\'si bağımsız bilgi taşımıyor: "Vadesi geçmiş" yapısal olarak 0\'a çakılı (overdue, dueDate üzerinden hesaplanıyor ama export_documents.due_date 30/30 satırda NULL) ve "Sorumlusuz" (13) ile "Bekleyen" (13) aynı sayıyı basıyor, çünkü unassigned = pending.filter(!responsibleName) ve responsible_id de 30/30 NULL — yani "Sorumlusuz" mevcut veriyle HER ZAMAN "Bekleyen"e eşit. Kullanıcı yan yana iki özdeş "13" görüyor ve "Vadesi geçmiş 0"u "hiçbir belge gecikmemiş" diye okuyor, oysa gerçek durum "vade hiç takip edilmiyor". Şeridin 1152px\'inin yarısı sıfır bilgi taşıyor. (Değer rengi doğru: sıfır muted basılıyor — bu bulgu kriter 6 değil, kriter 3.)',
    measure:
      '1440x900 /ihracat/belgeler: KPI değerleri [30, 13, 0, 13] → 3 farklı değer, 2 blok özdeş; psql: select count(*)=30, count(due_date)=0, count(responsible_id)=0 from export_documents. Kaynak: app/(app)/ihracat/belgeler/page.tsx:17-19.',
    target:
      'Şeritteki 4 KPI\'nın 4\'ü de bağımsız bir sayı bassın. Kök neden: packages/db/src/seed/export.ts bekleyen belgelere vade + sorumlu yazsın (aynı düzeltme ihracat-detay-20\'yi de kapatır). Alternatif/ek: takip edilmeyen bir metrik "0" yerine dürüst "—" bassın — KpiCard bunu zaten destekliyor (value=null → "—", bkz. kpi-card.tsx:36 ve satin-alma/kritik-stok/page.tsx:38 `neverEvaluated ? null : critical` kalıbı): value={pending.some(d => d.dueDate) ? overdue.length : null}. Kabul ölçütü: 4 KPI değeri arasında yinelenen değer yok VE "Vadesi geçmiş" ya gerçek bir sayı ya "—" basıyor.',
    file: 'apps/web/src/app/(app)/ihracat/belgeler/page.tsx:17-19, packages/db/src/seed/export.ts',
    openedRound: 9,
  },
];

R['/ihracat/kurlar'].round = 9;
R['/ihracat/kurlar'].scoreNotes =
  'Tur 8→9: 60 → 60. Yeniden ölçüldü: 1440x900 scrollWidth=clientWidth=1440, tablo 1152=kapsayıcı, 25/25 satır 36px, gövde 13px (172 düğüm), h1 24/600, 15 renk; Tur 8\'de kapatılan ihracat-kurlar-11/-12 doğrulandı — "Günlük değişim" 25/25 satırda 2 ondalıklı (-%3,36 / +%0,75 …), sütun slack 115 (hedef ≤150). Alış/Satış/Günlük değişim sağa hizalı + tabular-nums, artı/eksi işareti renkle DEĞİL işaretle de ayrışıyor. Grafik: 2 seri (EUR mor, USD mavi), ince çizgi, gölgesiz kart, y ekseni 4 kademe tek ondalık, x ekseni 15 etiket. 390x844: taşma yok, kart 63,5px, 44px altı hedef 0, sayfalama alt bar. Koyu temada (screens/ihracat-kurlar dark denemesi) grafik ve delta renkleri okunur. Yeni bulgu ihracat-kurlar-13 (P2, kriter 3) — kazanmayı engellemez.';
R['/ihracat/kurlar'].open = [
  {
    id: 'ihracat-kurlar-13',
    criterion: 3,
    severity: 'P2',
    text:
      '"Kaynak" sütunu tablonun 185px\'ini (%16) alıyor ama 25/25 satırda aynı değeri ("TCMB") basıyor — sıfır bilgi. Veritabanında iki değer var (TCMB-SEED 172, TCMB 8) ama Tur 4\'te açılan etiket eşlemesi (ihracat-kurlar-08) ikisini de "TCMB"ye çeviriyor, yani bu sütun mevcut mimaride ASLA farklı bir değer gösteremez. Linear/Stripe bu bilgiyi sütun yerine başlığa ("TCMB, son güncelleme 07.09.2026" — zaten sayfanın alt başlığında yazıyor) koyar.',
    measure:
      '1440x900 /ihracat/kurlar, probe-ihracat-r9.json kurlar_tables[0].cols: Kaynak width=185, distinctValues=1, rowsWithText=25, sample=["TCMB"], slack=115. psql: select source, count(*) from exchange_rates → TCMB-SEED 172, TCMB 8 (ikisi de UI\'da "TCMB").',
    target:
      'Ekranda görünen her sütun en az 2 farklı değer taşısın. "Kaynak" sütunu varsayılan gizli olsun (meta.defaultHidden — sütun seçicisinden açılabilir kalır; kaynak bilgisi zaten sayfa alt başlığında) ya da eşleme kaldırılıp gerçek kaynak (TCMB / manuel giriş) ayrıştırılsın. Kabul ölçütü: probe-ihracat-r9.ts ile görünür sütunların hepsinde distinctValues ≥ 2.',
    file: 'apps/web/src/modules/export/components/rates-table.tsx (Kaynak sütunu)',
    openedRound: 9,
  },
];

R['/ihracat/gtip'].round = 9;
R['/ihracat/gtip'].scoreNotes =
  'Tur 8→9: 60 → 60. Yeniden ölçüldü: 1440x900 scrollWidth=clientWidth=1440, tablo 1152=kapsayıcı, 39/39 satır 36,5-37px, gövde 13px (183 düğüm), h1 24/600, 15 renk (modülün en disiplinli paleti); Tur 8\'de kapatılan ihracat-gtip-09 doğrulandı — Ürün width=519 / maxContent=420 → slack 99 (hedef ≤120), SKU 109, Tip 81, GTİP 24. "Tip" sütunu 2 farklı değer taşıyor (Mamul/Hammadde) — ölü sütun değil. GTİP hücresi tam genişlikte satır içi Select (h-11 mobil / h-9 masaüstü), kenarlığı yalnız hover/odak/açık durumda beliriyor: 39 satırlık kontrol çorbası yok. 4 GTİP kodu kartı KPI şeridinin altında ayrı bant, her biri kod + birim + Türkçe tanım. 390x844: taşma yok, kart 60px × 39, 44px altı hedef 0. Yeni bulgu yok.';

writeFileSync(PATH, JSON.stringify(card, null, 1) + '\n');
console.log('ihracat.json Tur 9 güncellendi.');
for (const [r, v] of Object.entries<any>(card.routes)) {
  const total = v.scores.reduce((a: number, b: number) => a + b, 0);
  const blockers = v.open.filter((o: any) => o.severity === 'P0' || o.severity === 'P1').length;
  console.log(
    `${r.padEnd(32)} toplam=${total} ref=${v.referenceTotal} min=${Math.min(...v.scores)} açıkP0P1=${blockers} → ${total >= v.referenceTotal && Math.min(...v.scores) >= 4 && blockers === 0 ? 'KAZANAN: Plantero' : 'KAYBETTİ'}`,
  );
}

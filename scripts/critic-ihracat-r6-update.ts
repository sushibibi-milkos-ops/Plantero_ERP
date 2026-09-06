/** Tur 6 kritik — artifacts/critic/ihracat.json güncellemesi. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'artifacts/critic/ihracat.json');
const card = JSON.parse(readFileSync(file, 'utf8'));

card.round = 6;
card.note = [
  'Tur 6 (bağımsız kritik). Veritabanı yeniden tohumlandı — sevkiyat id\'leri değişti (EXP-000001 6224ef76…, EXP-000002 58c7a641…, EXP-000003 fce0b6c8…).',
  '6 rotanın tamamı 1440x900 + 390x844 yeniden çekildi ve `pnpm measure` ile ölçüldü (artifacts/critic/measure-ihracat-r6/*.json): hiçbir rotada yatay taşma yok (scrollWidth = clientWidth), masaüstü satır 36–37px, mobil kart 60–63,5px, h1 24/600 (mobil 20/600), 390px\'te 44px altı ETKİLEŞİMLİ hedef yok (yalnız breadcrumb metni).',
  'Tur 5\'in açık bulgusu yoktu; Tur 6\'da detay rotasında İKİ YENİ bulgu ölçüldü: (1) belge zinciri kartları dövizli belgeleri ₺ ile basıyor (ihracat-detay-16, P0) — aynı ekranda €270,00 ve ₺270,00 yan yana duruyor; (2) "Kur tarihi" alanı TCMB\'nin yayın yapmadığı bir güne (07.09.2026) işaret ediyor, oysa gösterilen 38,5000 kuru /ihracat/kurlar\'da 06.09.2026 satırında (ihracat-detay-17, P1).',
  'Doğrulama: shell-combobox-option-touch-01 (Tur 4\'te ihracat\'ta açılmıştı) bu yüzeyde KAPANMIŞ ölçüldü — /ihracat/sevkiyatlar/yeni 390px combobox seçeneği 44px.',
  'Kod taraması temiz: modül dosyalarında `transition-all`, `ease-in`, `scale(0)`, ≥300ms süre, `transform-origin` yok; hover yalnızca renk/kenarlık değiştiriyor (Tailwind v4 hover zaten hover:hover ile kapılı).',
  'Sonuç: 6 rotanın 5\'i kazanıyor, /ihracat/sevkiyatlar/[id] kaybediyor (60 → 57, kriter 6 = 3).',
].join(' ');

card.measurements = {
  round6: 'artifacts/critic/measure-ihracat-r6/*.json (6 rota × 1440x900 + 390x844); probe: scripts/probe-ihracat-r6.ts, scripts/probe-ihracat-r6b.ts',
  screens: [
    'artifacts/screens/ihracat-sevkiyatlar/{desktop,mobile}.png',
    'artifacts/screens/ihracat-sevkiyatlar-58c7a641-7817-4787-8aa2-60cc0f060e59/{desktop,mobile}.png',
    'artifacts/screens/ihracat-sevkiyat-detay-sekmeler-r5/*.png (gümrükte, 4 sekme × masaüstü+mobil — Tur 6\'da yeniden üretildi)',
    'artifacts/screens/ihracat-r6-durumlar/{kapali,taslak}-{desktop,mobile}.png + kapali-desktop-fatura.png',
    'artifacts/screens/ihracat-sevkiyatlar-yeni/{desktop,mobile}.png',
    'artifacts/screens/ihracat-belgeler/{desktop,mobile}.png',
    'artifacts/screens/ihracat-kurlar/{desktop,mobile}.png',
    'artifacts/screens/ihracat-gtip/{desktop,mobile}.png',
  ],
};

const R = card.routes;

R['/ihracat/sevkiyatlar'].round = 6;
R['/ihracat/sevkiyatlar'].scoreNotes =
  'Tur 5→6: 60 → 60 (değişiklik yok). Yeniden ölçüldü (measure-ihracat-r6/sevkiyatlar-{1440,390}.json): 1440x900 scrollWidth=clientWidth=1440, tbody satır 36/36/36px, gövde 13px (49 düğüm), h1 24/600, 22 farklı renk; 390x844 scrollWidth=clientWidth=390, kart 63,5px (56–72 bandı), 44px altı etkileşimli hedef 0. €/₺ sütunları sağ hizalı + tabular, sıfır tutar €0,00 soluk, ETD boşsa em-dash. Yeni bulgu yok.';

R['/ihracat/sevkiyatlar/[id]'].round = 6;
R['/ihracat/sevkiyatlar/[id]'].probeId =
  '58c7a641-7817-4787-8aa2-60cc0f060e59 (EXP-2026-000002, gümrükte) + 6224ef76-… (kapalı, faturalı) + fce0b6c8-… (taslak) — 4 sekme × 3 durum';
R['/ihracat/sevkiyatlar/[id]'].scores = [5, 5, 5, 5, 5, 3, 5, 5, 5, 5, 4, 5];
R['/ihracat/sevkiyatlar/[id]'].total = 57;
R['/ihracat/sevkiyatlar/[id]'].scoreNotes =
  'Tur 5→6: 60 → 57. Kriter 6 (rakam sunumu): 5→3 — ihracat-detay-16: belge zinciri kartı dövizli belgeyi ₺ ile basıyor; ÜÇ sevkiyatın üçünde de aynı sayı aynı ekranda iki para biriminde görünüyor (kapalı: zincirde ₺270,00, hemen altındaki fatura panelinde €270,00 / ₺10.044,00 — 37× fark; gümrükte: zincirde ₺16.800,00, panelde €16.800,00; taslak: zincirde ₺72,00, sipariş satırında €72,00). "Birim/para tutarlı" kriterinin çekirdeği kırık, 3. Kriter 11 (tutarlılık): 5→4 — ihracat-detay-17: "Kur bilgisi" panelindeki Kur tarihi 07.09.2026, ama /ihracat/kurlar\'da 07.09.2026 satırı YOK ve gösterilen ₺38,5000 orada 06.09.2026 EUR alışı olarak duruyor; iki ekran aynı kuru iki tarihe yazıyor. Kalan 10 kriter 5: satır 36px, sekme çubuğu taşmıyor, 1440 ve 390\'da scrollWidth=clientWidth, mobil kart 63,5px, 4 sekmenin başlık tipografisi tek stil, boş fatura durumu ekranda görünmeyen eylem adlandırmıyor.';
R['/ihracat/sevkiyatlar/[id]'].open = [
  {
    id: 'ihracat-detay-16',
    criterion: 6,
    criterionAlso: [11],
    severity: 'P0',
    owner: 'shell (DocumentChain) + ihracat (sayfa verisi)',
    text:
      'Belge zinciri kartları dövizli belgelerin tutarını Türk Lirası sembolüyle basıyor: `ChainNode` tipinde para birimi alanı yok (document-chain.tsx:12-20) ve kart `formatMoney(node.amount)` çağırıyor (document-chain.tsx:88), formatMoney varsayılanı ise TRY (lib/format.ts:44). Sonuç: aynı ekranda aynı sayı iki para biriminde okunuyor. EXP-2026-000001 (kapalı): zincirdeki FATURA kartı "₺270,00", 300px altındaki "İhracat faturası" paneli "Tutar €270,00 · TL karşılığı ₺10.044,00" — kullanıcı faturayı 37 kat düşük okuyabilir. EXP-2026-000002: zincirde SİPARİŞ "₺16.800,00", panelde "Proforma tutarı €16.800,00". EXP-2026-000003 (taslak): zincirde "₺72,00", sipariş satırında "€72,00 / €3,60". Veritabanı doğrulaması: sales_orders.currency=EUR (SO-2026-000023, SO-2026-000031, SO-2026-000032), invoices.currency=EUR (INV-2026-000012); document_index.amount belgenin KENDİ para biriminde saklanıyor ama tabloda currency sütunu yok.',
    measure:
      '1440x900, probe-ihracat-r6b.ts chainClosed: ["SİPARİŞ | Faturalandı | SO-2026-000023 | 07.09.2026 | ₺270,00 …", "FATURA | Kesildi | INV-2026-000012 | 15.08.2026 | ₺270,00 …"]; aynı sayfadaki invoicePanel: "Tutar | €270,00 | TL karşılığı | ₺10.044,00"; chainCustoms: "SİPARİŞ | … | SO-2026-000031 | … | ₺16.800,00"; psql: invoices.currency=EUR, sales_orders.currency=EUR. Aynı ekranda ₺ ile basılan dövizli düğüm sayısı = 2/2 (kapalı), 1/1 (gümrükte), 1/1 (taslak).',
    target:
      '`ChainNode`\'a `currency?: string` eklenip `formatMoney(node.amount, node.currency ?? "TRY")` çağrılsın; /ihracat/sevkiyatlar/[id] zincir düğümlerini sayfada zaten yüklü `order.currency` / `invoice.currency` / sevkiyat TRY ile zenginleştirsin (document_index şeması dondurulmuş — şema değişikliği gerekmiyor). Kabul ölçütü: sayfadaki HER zincir kartının para birimi sembolü, o belgenin kaynak kaydındaki `currency` ile birebir eşleşsin; EXP-2026-000001 zincirinde SİPARİŞ ve FATURA kartları "€270,00" göstersin, İHRACAT SEVKİYATI kartı "₺10.044,00" kalsın (ölçüm: probe chain metni ∩ /₺\\d/ = yalnızca TRY belgeler).',
    file: 'apps/web/src/components/document-chain.tsx:12-20,88 + apps/web/src/modules/export/queries.ts:112 (getChain sonucu zenginleştirme) + apps/web/src/app/(app)/ihracat/sevkiyatlar/[id]/page.tsx:73-79',
    openedRound: 6,
  },
  {
    id: 'ihracat-detay-17',
    criterion: 11,
    severity: 'P1',
    text:
      '"Fatura & kur" sekmesindeki Kur bilgisi paneli, TCMB\'nin yayın yapmadığı bir güne kur tarihi yazıyor. EXP-2026-000002\'de panel "Kur (TCMB) ₺38,5000 · Kur tarihi 07.09.2026" diyor; /ihracat/kurlar tablosunun EN YENİ satırı 06.09.2026 ve tam o kuru (EUR alış ₺38,5000) 06.09.2026\'ya yazıyor — 07.09.2026 satırı hiç yok. Kök neden: syncAmountTry kuru `getExchangeRate(..., effectiveDate, "buying")` ile en yakın ÖNCEKİ günden çözüyor ama `exchangeRateDate` alanına çözülen satırın rate_date\'ini değil `effectiveDate`i (proforma tarihi/bugün) yazıyor. Kapalı sevkiyatta sorun görünmüyor (15.08.2026 kuru gerçekten var), yani hata yalnızca TCMB\'nin henüz yayın yapmadığı günlerde — pratikte her yeni sevkiyatta — ortaya çıkıyor.',
    measure:
      '1440x900, probe-ihracat-r6b.ts fxPanelCustoms: "Kur (TCMB) | ₺38,5000 | Kur tarihi | 07.09.2026"; kurlarTop[0] = "06.09.2026 EUR ₺38,5000 ₺38,7000 TCMB"; psql: select max(rate_date) from exchange_rates = 2026-09-06, EUR/2026-09-07 satırı 0 kayıt; export_shipments.exchange_rate_date = 2026-09-07.',
    target:
      '"Kur tarihi" ekranda gösterilen kurun GERÇEK yayın tarihini göstersin: syncAmountTry çözülen `exchange_rates.rate_date`\'i yazsın (shipments.ts:78), ya da alan "Değerleme tarihi" olarak yeniden adlandırılıp kur yayın tarihi ayrı basılsın. Kabul ölçütü: sevkiyat detayındaki (Kur, Kur tarihi) çifti için `exchange_rates` tablosunda currency+rate_date+buying eşleşen 1 satır bulunsun (3/3 sevkiyatta), ve o tarih /ihracat/kurlar tablosunda görünür bir satır olsun.',
    file: 'packages/core/src/export/shipments.ts:78 (exchangeRateDate: effectiveDate) + apps/web/src/app/(app)/ihracat/sevkiyatlar/[id]/page.tsx:219',
    openedRound: 6,
  },
];

R['/ihracat/sevkiyatlar/yeni'].round = 6;
R['/ihracat/sevkiyatlar/yeni'].scoreNotes =
  'Tur 5→6: 60 → 60. Yeniden ölçüldü: 1440 ve 390\'da scrollWidth=clientWidth, tek kolon form + yapışkan eylem çubuğu, h1 24/600 → 20/600. Tur 4\'te bu yüzeyde açılan ortak bileşen bulgusu shell-combobox-option-touch-01 KAPANMIŞ doğrulandı: 390px\'te sipariş combobox seçeneği yüksekliği 44px (probe-ihracat-r6b.ts comboOptions), seçenek metni "SO-2026-000033 — BioGrün Handels GmbH · €216,00" (tr-TR, 2 basamak, doğru para birimi). Yeni bulgu yok.';

R['/ihracat/belgeler'].round = 6;
R['/ihracat/belgeler'].scoreNotes =
  'Tur 5→6: 60 → 60. Yeniden ölçüldü (measure-ihracat-r6/belgeler-*.json): 1440x900 satır 36/36/36px, 30 satır ilk ekranda, gövde 13px (112 düğüm), 22 renk, taşma yok; 390x844 kart 60px, 44px altı etkileşimli hedef 0. Yeni bulgu yok.';

R['/ihracat/kurlar'].round = 6;
R['/ihracat/kurlar'].scoreNotes =
  'Tur 5→6: 59 → 59. Kriter 3 hâlâ 4 (referans Stripe 4 ile aynı, kazanmayı engellemiyor): 1152px\'lik tabloda 5 sütun — Tarih 208, Para birimi 227, Alış 227, Satış 227, Kaynak 264px; "TCMB"/"EUR" gibi kısa değerler geniş sütunlarda yüzüyor (kök neden ortak bileşen: shell-datatable-slack-01, shell kartında açık). Diğer 11 kriter 5: 25 satır × 36px, 4 ondalık ₺ kurlar tabular ve sağ hizalı, KPI iki blok dikey ince ayraçla, çizgi grafik iki seri + susturulmuş grid, 390px\'te taşma yok. Yeni bulgu yok.';

R['/ihracat/gtip'].round = 6;
R['/ihracat/gtip'].scoreNotes =
  'Tur 5→6: 59 → 59. Kriter 3 hâlâ 4: "Ürün" sütunu 692px genişlikte ama en uzun değer ~250px — SKU 130 / Ürün 692 / Tip 110 / GTİP 220 (probe-ihracat-r6b.ts gtipCols), Ürün ile Tip arasında ~440px ölü alan (kök neden shell-datatable-slack-01). Diğer 11 kriter 5: 39 satır × 36,5–37px, gövde 13px (183 düğüm), 15 renk, GTİP hücresi satır içi select (44px mobil / 36px masaüstü), 390px\'te taşma yok ve 44px altı hedef yok. Yeni bulgu yok.';

writeFileSync(file, JSON.stringify(card, null, 1) + '\n', 'utf8');
console.log('ok', file);

/** Tur 5 kritik puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const p = resolve(process.cwd(), 'artifacts/critic/kokpit.json');
const card = JSON.parse(readFileSync(p, 'utf8'));
const R = 5;

const close = (route: string, id: string, measureAfter: string) => {
  const r = card.routes[route];
  const i = r.open.findIndex((o: any) => o.id === id);
  if (i < 0) throw new Error(`açık bulgu yok: ${id}`);
  const [f] = r.open.splice(i, 1);
  f.closedRound = R; f.verifiedBy = 'ölçüm'; f.measureAfter = measureAfter;
  (r.closed ||= []).unshift(f);
};
const keep = (route: string, id: string, measure: string) => {
  const f = card.routes[route].open.find((o: any) => o.id === id);
  if (!f) throw new Error(`açık bulgu yok: ${id}`);
  f.measure = measure; f.remeasuredRound = R;
};
const open = (route: string, f: any) => { card.routes[route].open.push({ openedRound: R, ...f }); };
const setScores = (route: string, scores: number[], notes: Record<string, string>, verdict: string) => {
  const r = card.routes[route];
  r.round = R; r.scores = scores; r.total = scores.reduce((a, b) => a + b, 0);
  r.scoreNotes = notes; r.verdict = verdict;
};

// ---- admin -------------------------------------------------------------
close('/kokpit?rol=admin', 'kokpit-channel-decimal-mix-01',
  "1440x900 /kokpit (admin) Tur 5: 'Günlük kanal satışları' monies = ['₺2.678,40@815','₺2.678,40@815'] → mixedDecimals=false (artifacts/critic/probe-kokpit-r5/admin-1440.json).");
keep('/kokpit?rol=admin', 'kokpit-fold-rows-01',
  "1440x900 /kokpit (admin) Tur 5: foldRows 11 (probe-kokpit-r3d, top<innerHeight — Tur 3/4 ile aynı tanım). 'Kritik stok' boş durumu HÂLÂ 277px (EmptyState compact py-10 değişmedi, shell-emptystate-compact-height-01 açık). Ek katkı: 'Günlük kanal satışları' 145px'lik bölümde 2 satır taşıyor ve ikisi de AYNI değeri basıyor (özet 'Brüt (bugün)' ₺2.678,40 = tek kanal 'İhracat' ₺2.678,40) — tek kanallı veride bölüm 2 satırın 1 farklı değerini gösteriyor. Gece yarısı sonrası ikinci örnek (07.09 00:01): foldRows 7, 'Günlük kanal satışları' da boş duruma düşüp 258px'e çıkıyor.");
open('/kokpit?rol=admin', {
  id: 'kokpit-admin-col-balance-03', criterion: 2, severity: 'P1',
  text: "İki kolonlu pano dengesi yeniden bozuldu: sol kolon (Günlük kanal satışları + Break-even + Bugün + Onay kuyruğu + Son aktiviteler) 1356px'te bitiyor, sağ kolon (Banka + Üretim hatları + Kritik stok + SKT riski + Geciken alacak) 1615px'te — sol kolonun altında 259px ölü alan. Tur 2'de aynı bulgu (kokpit-col-balance-01) bölümler elle yeniden dağıtılarak 155px'e indirilmiş, Tur 4'te 13px ölçülmüştü; içerik hacmi değişince (Son aktiviteler 8 satırdan 1 satıra düştü) denge yeniden bozuldu. Kök neden statik kolon ataması: DashboardGrid `lg:grid-cols-2 lg:items-start` altında iki sabit `<div>` var, bölüm dağılımı veri hacminden bağımsız derleme zamanında sabitlenmiş.",
  measure: "1440x900 /kokpit (admin) Tur 5: kolon dipleri 1356 / 1615 → 259px (artifacts/critic/probe-kokpit-r5/admin-1440.json). Bir saat sonraki ikinci örnekte (07.09 00:01, aynı sayfa) 1308 / 1615 → 307px — yani fark içerikle 259-307px arasında geziniyor, eşik (≤200px) iki örnekte de aşılıyor.",
  target: "Kolon dibi farkı ≤200px, İÇERİKTEN BAĞIMSIZ. Elle yeniden dağıtım üçüncü kez yeterli değil: dağıtım çalışma zamanında yapılmalı (ör. DashboardGrid'e bölüm listesi verilip yüksekliğe göre iki kolona bölünmesi, ya da `lg:columns-2` CSS çok-kolonlu akış). Kabul ölçütü: seed verisiyle ve 'Bugün'/'Son aktiviteler' boşken çekilen İKİ ölçümde de colSpread ≤200px.",
  file: 'apps/web/src/modules/kokpit/components/gm-dashboard.tsx:34-210 (DashboardGrid iki sabit kolon <div>) + apps/web/src/modules/kokpit/components/shared.tsx:101 (DashboardGrid)',
});
open('/kokpit?rol=admin', {
  id: 'kokpit-activity-row-anatomy-01', criterion: 11, severity: 'P1',
  text: "'Son aktiviteler' listesi kokpitin ortak `RowLink` satır anatomisini kullanmıyor: elle yazılmış `<li className=\"flex items-center justify-between gap-3 px-4 py-2 text-[13px]\">` → 35.5px. Aynı ekrandaki diğer üç tek satırlık liste (Banka, SKT riski, Geciken alacak) `RowLink` ile 40px. Aynı bilgi sınıfı (tek satır metin + sağa yaslı meta), iki farklı satır yüksekliği. Bu, Tur 4'te muhasebe kesitinde kapatılan kokpit-fin-row-anatomy-01 ile BİREBİR aynı desen kalıntısı; finance-dashboard.tsx:121'de ('Bugünün tahsilatları' liste satırı, `li.flex.h-11` = 44px) üçüncü bir kopyası daha duruyor — o bölüm şu an boş durumda olduğu için ekranda görünmüyor (veri gelince 44px'lik üçüncü yükseklik ortaya çıkar).",
  measure: "1440x900 /kokpit (admin) Tur 5: 'Son aktiviteler' rowH [35.5,35.5,35.5] ↔ Banka/SKT riski/Geciken alacak rowH [40,40,40] (artifacts/critic/probe-kokpit-r5/admin-1440.json + admin-1440-r5.json rowHeights). Kod: gm-dashboard.tsx:114 elle yazılmış li; finance-dashboard.tsx:121 elle yazılmış li.h-11.",
  target: "Ekrandaki tüm tek satırlık liste satırları tek yükseklikte: 40px (li dış 41px). 'Son aktiviteler' RowLink anatomisini paylaşsın (hedef rota yoksa RowLink'in link olmayan kardeşi/`asChild` olmayan varyantı, ör. shared.tsx'e `Row` tabanı çıkarılıp RowLink onu sarmalasın); finance-dashboard.tsx:121'deki h-11 satırı da aynı tabanı kullansın. Kabul ölçütü: /kokpit (admin) ve /kokpit (muhasebe) kesitlerinde tek satırlık liste satırı yüksekliklerinin distinct kümesi = {40}.",
  file: 'apps/web/src/modules/kokpit/components/gm-dashboard.tsx:114 + apps/web/src/modules/kokpit/components/finance-dashboard.tsx:121 (referans anatomi: shared.tsx:56 RowLink)',
});
setScores('/kokpit?rol=admin', [5, 4, 4, 5, 5, 5, 5, 5, 5, 5, 4, 5], {
  '1': "5 — kademe değişmedi: h1 24/600, KPI/StatStrip 15/600, bölüm başlığı 13/600, gövde 13/400, meta 12, mikro 11, şerit etiketi 10. Kokpit'e ait 14px element yok (kalan 2 adet shell: PageHeader alt başlığı 14/400, EmptyState başlığı 14/500).",
  '2': "5→4 — GEREKÇELİ DÜŞÜŞ (yeni ölçüm): kolon dipleri 1356 / 1615 → fark 259px, kartın kendi eşiğinin (≤200px) dışında; Tur 4'te 13px'ti. İkinci örnekte 307px. Sayfa kenarı 24px, bölüm arası gap-4, kart içi 16px ritmi bozulmadı — düşüş yalnızca kolon dibi farkından (kokpit-admin-col-balance-03).",
  '3': "4 — foldRows 11 (hedef ≥15) değişmedi. 'Kritik stok' boş durumu 277px (shell EmptyState compact py-10), 'Günlük kanal satışları' 145px'te 2 satırla tek değer taşıyor. Satırlar: Bugün 58.5 (2 satırlık anatomi, 568px kolon), Üretim hatları 52.5, Banka/SKT/Geciken 40, Son aktiviteler 35.5. Stripe referansı kriter 3'te zaten 4 → parite.",
  '4': '5 — distinctColors 21 (masaüstü) / 19 (390px); yeşil=başarı+marka, kırmızı=negatif tutar, amber=SKT uyarısı, gri=nötr. Dekoratif renk yok.',
  '5': '5 — 1440px’te kırpılan metin YOK (truncate envanteri boş), tutar sütunu sağ kenarı bölüm içinde tek x’e kilitli (rowRightSpread 0), hairline ayraç, gölgesiz kart.',
  '6': "4→5 — kokpit-channel-decimal-mix-01 KAPANDI: 'Günlük kanal satışları' monies ['₺2.678,40@815','₺2.678,40@815'] → mixedDecimals=false. tabular-nums 20/20; sıfırların 7'si de oklab(0.552 … / 0.7) soluk, sıfır olmayanlar oklch(0.21 …) tam kontrast.",
  '7': "5 — kokpit/loading.tsx var; 'Kritik stok yok' boş durumu ikon + açıklama + 'Satın alma siparişi oluştur' eylemi taşıyor.",
  '8': '4→5 — shell-button-active-state-01 kokpit tarafında ÖLÇÜMLE KAPANDI: main içindeki 34 etkileşimli yüzeyin 34’ünde `active:` var (KPI şeridi active:bg-accent/60 + md:active:bg-accent/45, "Tümü" bağlantıları active:text-foreground/80, RowLink active:bg-muted/60, Button [&:active:not(:focus-visible)]:scale-[0.97]). hover `@media (hover:hover)` ile korunuyor, focus-visible ring-2 inset.',
  '9': '5 — 390px: yatay taşma yok (390/390), 44px altı etkileşimli hedef yok, mobil kartlar 62.5-65.5px, KPI şeridi snap + peek. Kırpılan iki metin de ellipsis’li (hat adı 271/298, WO satırı 246/264).',
  '10': '5 — 16px ikon seti, banka satırlarında ikon toplam satırını hesap satırlarından ayırıyor, süs ikonu yok.',
  '11': "5→4 — GEREKÇELİ DÜŞÜŞ (yeni ölçüm): 'Son aktiviteler' satırları elle yazılmış li ile 35.5px, aynı ekrandaki Banka/SKT riski/Geciken alacak RowLink ile 40px — tek satırlık liste satırı iki farklı yükseklikte (kokpit-activity-row-anatomy-01). StatStrip/TodayRow/ProductionLineRow/BankAccountsList tarafı tek anatomi.",
  '12': '5 — kutu içinde kutu yok, çerçeve çorbası yok, hairline ayraçlar, gölgesiz kartlar, default HTML görünümü yok.',
}, 'KAZANAN: Stripe');

// ---- depo --------------------------------------------------------------
close('/kokpit?rol=depo', 'kokpit-karantina-decimal-mix-01',
  "1440x900 /kokpit (depo) Tur 5: 'Karantina' monies = ['₺55.355,00@815','₺36.400,00@815','₺7.875,00@815','₺5.760,00@815','₺5.320,00@815'] → mixedDecimals=false (artifacts/critic/probe-kokpit-r5/depo-1440.json).");
setScores('/kokpit?rol=depo', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], {
  '1': "5 — kokpit'e ait 14px element yok (kalan 2 adet shell). 9px'lik tek element bildirim sayacı rozeti (üst bar, shell).",
  '2': "5 — Karantina 253px / SKT riski 311px (2 kolonlu bantta fark 58px); 'Bugün' lg:col-span-2 alt şeritte tam genişlik.",
  '3': '5 — tek satırlık listelerin tamamı 40px (Karantina 4, SKT riski 5, Bugün 10 satır); foldRows 16 ≥ 15. Mobil kartlar 62.5-64.5px (hedef 56-72).',
  '4': '5 — distinctColors 22 (masaüstü) / 20 (390px).',
  '5': "5 — Karantina'da ürün adı sütunu 4 satırda da x=437, lokasyon x=607, tutar x=815; 'Bugün' şeridinde 4 sütun sabit; 1440px'te kırpma YOK, rowRightSpread 0.",
  '6': "4→5 — kokpit-karantina-decimal-mix-01 KAPANDI: toplam satırı artık ₺55.355,00 (MoneyCell, 2 hane), lot satırlarıyla aynı ondalık dili → mixedDecimals=false. tabular-nums tam, 'SKT riski 60-90 gün 0' soluk.",
  '7': '5 — kokpit/loading.tsx var; bu kesitte boş durum render edilmiyor.',
  '8': '4→5 — shell-button-active-state-01 kapandı: 26 etkileşimli yüzeyin 26’sında `active:` var.',
  '9': '5 — 390px: taşma yok (390/390), 44px altı etkileşimli hedef yok, kırpılan metin yok, kartlar 62.5-64.5px.',
  '10': '5 — 16px ikon seti, lot durumu nokta ile, süs ikonu yok.',
  '11': '5 — Karantina/SKT/Bugün tek RowLink anatomisi (hepsi 40px); SKT şeridi GM kesitiyle birebir aynı.',
  '12': '5 — hairline ayraç, gölgesiz kart, kutu içinde kutu yok.',
}, 'KAZANAN: Plantero');

// ---- muhasebe ----------------------------------------------------------
close('/kokpit?rol=muhasebe', 'kokpit-fin-row-anatomy-01',
  "1440x900 /kokpit (muhasebe) Tur 5: Banka rowH [40,40,40], Mutabakat kuyruğu rowH [40,40,40,40,40,40,40,40], Geciken alacak rowH [40,40,40,40] — üçü de `li > a[href]` (RowLink), tıklanabilir, hover/focus-visible/active taşıyor (artifacts/critic/probe-kokpit-r5/muhasebe-1440-r5.json rowHeights).");
keep('/kokpit?rol=muhasebe', 'kokpit-fin-fold-rows-01',
  "1440x900 /kokpit (muhasebe) Tur 5: foldRows 13 (Tur 4: 12; satırlar 44→40px inince +1). Hedefe (≥15) 2 satır kaldı. 'Bugünün tahsilatları' boş durumu hâlâ 258px (EmptyState compact py-10 değişmedi).");
open('/kokpit?rol=muhasebe', {
  id: 'kokpit-fin-payments-row-h11-01', criterion: 11, severity: 'P2',
  text: "'Bugünün tahsilatları' liste satırı Tur 4 düzeltmesinin dışında kalmış: `<li className=\"flex h-11 items-center …\">` (44px, href yok). Bölüm şu an boş durumda olduğu için ekranda görünmüyor; tahsilat kaydedildiği anda aynı ekranda üçüncü bir satır yüksekliği (44px) ve tıklanamayan bir satır ortaya çıkar — Tur 4'te kapatılan kokpit-fin-row-anatomy-01 aynen geri gelir.",
  measure: 'Kod: apps/web/src/modules/kokpit/components/finance-dashboard.tsx:121 `li.flex.h-11` (href yok). Ekran: bölüm boş durumda (paymentsToday.length === 0), 1440x900 Tur 5’te render edilmiyor.',
  target: "Bu liste de `RowLink`e (40px, href → /finans/tahsilat/[id] ya da /finans/tahsilat) taşınsın. Kabul ölçütü: seed'e bugün tarihli bir tahsilat eklendiğinde /kokpit (muhasebe) tek satırlık liste satırı yüksekliklerinin distinct kümesi = {40}.",
  file: 'apps/web/src/modules/kokpit/components/finance-dashboard.tsx:121',
});
setScores('/kokpit?rol=muhasebe', [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5], {
  '1': '5 — kokpit’e ait 14px element yok; kademe h1 24 / KPI-StatStrip 15 / gövde 13 / meta 12 / mikro 11 / şerit etiketi 10.',
  '2': "5 — kolon dipleri 999 / 1137 (fark 138px, hedef ≤200px). 'Nakit projeksiyonu' hücresi StatStrip'in belgelenmiş `top` varyantı (etiket-üstte) — bilinçli, tek bileşen.",
  '3': "4 — foldRows 13 (hedef ≥15); satır yüksekliği artık 40px'e indi (Tur 4: 44px). Kalan engel 'Bugünün tahsilatları' boş durumunun 258px'i (shell EmptyState). Stripe referansı kriter 3'te zaten 4 → parite.",
  '4': '5 — distinctColors 15 (beş kesitin en temizi); negatif tutar KPI şeridinde de listede de aynı kırmızı; dekoratif yeşil yok.',
  '5': '5 — tutar sütunu her listede tek x’e kilitli (815 / 1399), hairline ayraç, 1440px’te kırpma yok, KDV pozisyonu divide-x StatStrip.',
  '6': '5 — tabular-nums tam; €0,00 ve KPI ₺0 soluk (oklab(0.552 … / 0.7)); listelerin tamamı 2 hane, KPI/StatStrip 0 hane (sistematik ayrım), bölüm içi karışık ondalık yok.',
  '7': "5 — loading.tsx var; 'Bugün tahsilat yok' ikon + açıklama + 'Tahsilat kaydet' eylemi taşıyor.",
  '8': '4→5 — shell-button-active-state-01 kapandı: 28 etkileşimli yüzeyin 28’inde `active:` var.',
  '9': '5 — 390px: taşma yok, 44px altı etkileşimli hedef yok, KDV şeridi 2x2, tek kırpma ellipsis’li (324/331).',
  '10': '5 — banka satırlarında 16px ikon hesap satırını toplam satırından ayırıyor; başka ikon yok.',
  '11': "4→5 — kokpit-fin-row-anatomy-01 KAPANDI: Banka + Mutabakat kuyruğu + Geciken alacak üçü de RowLink (40px, link, hover/focus/active). Banka listesi artık GM panosuyla PAYLAŞILAN BankAccountsList bileşeni. (Açık P2: 'Bugünün tahsilatları' satırı hâlâ elle yazılmış h-11, şu an boş durumda olduğu için görünmüyor — kokpit-fin-payments-row-h11-01.)",
  '12': '5 — kutu içinde kutu yok, ayraçsız blok yok, gölgesiz kart.',
}, 'KAZANAN: Plantero');

// ---- satis -------------------------------------------------------------
close('/kokpit?rol=satis', 'kokpit-satis-order-row-density-01',
  "1440x900 /kokpit (satış) Tur 5: 'Son siparişler' rowH 10 satırın 10'unda da 40px (Tur 4: 58.5-59.5px), rowRightSpread 0, foldRows 17 (hedef ≥15) (artifacts/critic/probe-kokpit-r5/satis-1440.json + satis-1440-r5.json). 390px'te 2 satırlık anatomi korunmuş.");
keep('/kokpit?rol=satis', 'kokpit-satis-kpi-title-trunc-01',
  "390x844 /kokpit (satış) Tur 5: KPI başlığı 'Bugünkü ciro (brüt = net)' clientW 126 / scrollW 144 (18px eksik, ellipsis'li) — DEĞİŞMEDİ.");
setScores('/kokpit?rol=satis', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], {
  '1': "5 — 14px yalnızca shell (PageHeader alt başlığı + arama placeholder'ı); 'Kanal ciro' / huni satırları 13px.",
  '2': "5 — kolon dipleri 448 / 526 (fark 78px); 'Son siparişler' lg:col-span-2 alt şeritte tam genişlik.",
  '3': "4→5 — kokpit-satis-order-row-density-01 KAPANDI: 'Son siparişler' 1152px'lik şeritte artık TEK satır, 10 satırın 10'u 40px (TodayRow deseni, @container ≥1024px); mobilde 2 satırlık anatomi korundu. foldRows 17 ≥ 15. 'En çok satan 5' 40px.",
  '4': '5 — kanal ve huni çubukları tek RankBar anatomisi, tek hue; doygun yeşil yüzey 1.',
  '5': '5 — kırpma yok, tutar sağ kenarı 10 satırın 10’unda x=1399, rozet yuvası sabit genişlikte (w-32), hairline ayraç.',
  '6': '5 — tabular-nums 20/20, tüm tutarlar 2 hane, QtyCell birimi 11px muted, bölüm içi karışık ondalık yok; sıfır değer yok.',
  '7': '5 — loading.tsx var; bu kesitte boş durum render edilmiyor.',
  '8': '4→5 — shell-button-active-state-01 kapandı: 21 etkileşimli yüzeyin 21’inde `active:` var.',
  '9': "5 — 390px: taşma yok, 44px altı etkileşimli hedef yok, kartlar 63-65.5px. (Açık P2: KPI kartı başlığı 'Bugünkü ciro (brüt = net)' 126/144px kırpılıyor — kokpit-satis-kpi-title-trunc-01; parantez içi nitelik okunamıyor ama başlık ellipsis'li ve değer tam.)",
  '10': '5 — süs ikonu yok, sıra numarası ikon yerine tipografiyle veriliyor.',
  '11': '5 — RowLink/StatusBadge/MoneyCell/QtyCell tek anatomi; huni ve kanal çubukları tek RankBar; satır yüksekliği ekranın tamamında 40px.',
  '12': '5 — çerçeve çorbası yok, gölgesiz kart, hairline ayraç, boş sağ yarı yok.',
}, 'KAZANAN: Plantero');

// ---- uretim ------------------------------------------------------------
close('/kokpit?rol=uretim', 'kokpit-uretim-col-balance-02',
  "1440x900 /kokpit (üretim şefi) Tur 5: kolon dipleri 979 (sol: Hat durumu + Fire kırılımı + Son duruşlar) / 797 (sağ: Son iş emirleri) → fark 182px (hedef ≤200px; Tur 4: 266px) (artifacts/critic/probe-kokpit-r5/uretim_sefi-1440.json).");
keep('/kokpit?rol=uretim', 'kokpit-uretim-fold-rows-02',
  "1440x900 /kokpit (üretim şefi) Tur 5: foldRows 14 (probe-kokpit-r3d; Tur 4: 13). Hedefe (≥15) 1 satır kaldı. 'Fire kırılımı' boş durumu hâlâ 258px (EmptyState compact py-10 değişmedi).");
setScores('/kokpit?rol=uretim', [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5], {
  '1': '5 — h1 24/600, gövde 13px, meta 11-12px; 14px yalnızca shell PageHeader alt başlığı + EmptyState.',
  '2': "4→5 — kokpit-uretim-col-balance-02 KAPANDI: 'Son duruşlar' sol kolona alındı, kolon dipleri 979 / 797 → 182px (hedef ≤200px, Tur 4: 266px).",
  '3': "4 — foldRows 14 (hedef ≥15). 'Son iş emirleri' 568px'lik kolonda 5 alan taşıdığı için 58.5px'lik 2 satırlık anatomi kullanıyor (haklı), 'Son duruşlar' 39.5-41, 'Hat durumu' 52.5. Kalan engel 'Fire kırılımı' boş durumunun 258px'i (shell EmptyState).",
  '4': '5 — distinctColors 24; yeşil/amber/gri rozetler + tek mavi “Planlandı”; dekoratif renk yok.',
  '5': '5 — 1440px’te kırpılan metin YOK; miktar/birim sütununun sağ kenarı 8 satırın 8’inde x=1399; hairline ayraç.',
  '6': "4→5 — shell-qtycell-zero-tone-01 kokpit tarafında ÖLÇÜMLE KAPANDI: 'Son iş emirleri'ndeki iki '0 ADET' artık oklab(0.552 0.00438 -0.01539 / 0.7) — MoneyCell'in €0,00 tonuyla BİREBİR aynı formül; dolu miktarlar (39/76/196/47/57/98 ADET) oklch(0.21 …) tam kontrast. tabular-nums tam, KPI 'Geciken iş emri 0' ve 'Fire oranı %0' soluk.",
  '7': "5 — loading.tsx var; 'Son 7 günde fire kaydı yok' ikon + açıklama + 'İş emirlerini gör' eylemi taşıyor.",
  '8': '4→5 — shell-button-active-state-01 kapandı: 20 etkileşimli yüzeyin 20’sinde `active:` var.',
  '9': '5 — 390px: taşma yok, 44px altı etkileşimli hedef yok, kartlar 64.5-65.5px; kırpmaların 7’si de ellipsis’li (hat adları 125/146).',
  '10': '5 — süs ikonu yok, durum noktası + rozet tek dil.',
  '11': '5 — ProductionLineRow GM ile tek bileşen, StatStrip paylaşılıyor, ‘Son duruşlar’ satırı 40px ile ekranın geri kalanıyla aynı.',
  '12': '5 — kutu içinde kutu / çerçeve çorbası yok, gölgesiz kart, hairline ayraç.',
}, 'KAZANAN: Plantero');

card.round = R;
card.note = [
  'Tur 5 (kritik): 5 rol kesiti yeniden çekildi (scripts/shot-kokpit-r3.ts, 1440x900 + 390x844).',
  'Ölçümler: artifacts/critic/measure-kokpit-r5/ (pnpm measure), artifacts/critic/probe-kokpit-r5/*-1440.json ve *-390.json (scripts/probe-kokpit-r4.ts: ondalık tutarlılığı, sağ kenar hizası, kolon dengesi, boş durum yüksekliği, kırpma envanteri),',
  '*-1440-r3d.json (scripts/probe-kokpit-r3d.ts, foldRows tanımı top<innerHeight — Tur 3/4 ile karşılaştırılabilirlik) ve *-1440-r5.json (scripts/probe-kokpit-r5.ts: `active:` kapsaması, sıfır tonu, StatStrip anatomisi, satır yükseklikleri).',
  'KAPANAN TUR 4 BULGULARI (5): kokpit-channel-decimal-mix-01 (admin mixedDecimals=false), kokpit-karantina-decimal-mix-01 (depo mixedDecimals=false),',
  'kokpit-fin-row-anatomy-01 (muhasebe: Banka + Mutabakat + Geciken üçü de RowLink 40px, a[href]), kokpit-satis-order-row-density-01 (Son siparişler 58.5→40px, foldRows 17),',
  'kokpit-uretim-col-balance-02 (kolon farkı 266→182px).',
  'ORTAK BİLEŞEN BULGULARI (shell.json) kokpit tarafında doğrulandı: shell-button-active-state-01 KAPALI — `active:` kapsaması 34/34 (admin), 26/26 (depo), 28/28 (muhasebe), 21/21 (satış), 20/20 (üretim);',
  "shell-qtycell-zero-tone-01 KAPALI — üretim '0 ADET' artık MoneyCell ile aynı soluk ton. shell-emptystate-compact-height-01 HÂLÂ AÇIK (P2): EmptyState compact py-10 değişmedi, bölüm yüksekliği 258-277px; üç kesitin foldRows'unu 15'in altında tutan tek kalan neden.",
  'YENİ AÇIK BULGULAR (admin, 2 adet P1): (a) kokpit-admin-col-balance-03 — kolon dibi farkı 259px (ikinci örnekte 307px); statik kolon ataması içerik hacmi değişince üçüncü kez bozuldu, çözüm çalışma zamanı dağıtımı olmalı.',
  "(b) kokpit-activity-row-anatomy-01 — 'Son aktiviteler' elle yazılmış li ile 35.5px, aynı ekrandaki RowLink listeleri 40px; Tur 4'te muhasebede kapatılan desenin kalıntısı (finance-dashboard.tsx:121'de üçüncü kopyası latent duruyor).",
  'KOD DÜZEYİ HAREKET TARAMASI TEMİZ: modules/kokpit + kokpitin kullandığı ortak bileşenlerde `transition: all` / `transition-all`, `ease-in`, `scale(0)`, ≥300ms süre eşleşmesi YOK;',
  '`hover:` globals.css:10-16’da `@media (hover:hover) and (pointer:fine)` ile korunuyor; `:active` basma efekti globals.css:176-181’de `:not(:focus-visible)` guard’ıyla klavye aktivasyonundan ayrılmış;',
  'prefers-reduced-motion 120ms’e indiriyor, animate-spin (800ms) / animate-pulse (2s) sürekli göstergelerine istisna tanıyor.',
  'ÖLÇÜM KARARLILIĞI NOTU: probe koşuları Europe/Istanbul 6 Eylül 23:xx’de yapıldı; 7 Eylül 00:01’de tekrarlanan admin örneğinde gün dönümü nedeniyle “Bugün” ve “Günlük kanal satışları” boş duruma düşüp foldRows 11→7, colSpread 259→307 oldu. Tur 5 kaydı gün dönümü ÖNCESİ örnektir.',
].join(' ');

writeFileSync(p, JSON.stringify(card, null, 1) + '\n');
console.log('kokpit.json güncellendi (tur 5).');
for (const [r, v] of Object.entries<any>(card.routes)) {
  console.log(r, 'total', v.total, 'ref', v.referenceTotal, v.verdict, 'open:', v.open.map((o: any) => `${o.id}/${o.severity}`).join(', ') || 'yok');
}

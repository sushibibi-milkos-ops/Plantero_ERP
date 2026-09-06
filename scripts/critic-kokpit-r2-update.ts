/** Tur 2 kokpit puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). Sadece artifacts/critic/kokpit.json yazar. */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'artifacts/critic/kokpit.json';
const c = JSON.parse(readFileSync(p, 'utf8'));
c.round = 2;
c.note =
  'Tur 2: Tur 1 bulgularının tamamı yeniden ölçüldü (artifacts/critic/measure-kokpit-r2/, artifacts/critic/probe-kokpit-r2/, scripts/probe-kokpit-r2.ts). ' +
  'kokpit-empty-action-01 DIŞINDA hepsi kapalı doğrulandı; o bulgu EKSİK kapatılmıştı (kokpitteki 14 compact EmptyState’in yalnızca 2’sine eylem eklenmiş), ' +
  'bu turda ekranda görünen diğer ikisi ("Bugün tahsilat yok", "Son 7 günde fire kaydı yok") hâlâ çıplak — yeni bulgu olarak açıldı (kokpit-empty-action-02/03). ' +
  'Kod düzeyi hareket taraması (transition-all / ease-in / scale(0) / >300ms süre / hover gating) TEMİZ: kokpit dosyalarında tek eşleşme yok, Tailwind v4 hover varyantı ' +
  'globals.css:11’de @media (hover: hover) and (pointer: fine) ile korunuyor. Ekran görüntülerinin sol altındaki siyah daire Next.js dev overlay göstergesidir ' +
  '(uygulama kodu değil) — bulgu açılmadı. measure.ts touchTargetsBelow44 listesindeki breadcrumb-page (39x19.5) ve masaüstü "Tümü" bağlantıları (47.8x16) mobilde ' +
  'max-md:min-h-11 ile 44px’e çıkıyor — yanlış pozitif, bulgu açılmadı.';

type Finding = { id: string; criterion: number; severity: string; text: string; measure: string; target: string; file: string; openedRound: number };
const O = (id: string, criterion: number, severity: string, text: string, measure: string, target: string, file: string): Finding => ({
  id, criterion, severity, text, measure, target, file, openedRound: 2,
});

function setRoute(key: string, scores: number[], reference: string, referenceTotal: number, verdict: string, open: Finding[], scoreNotes: Record<string, string>, shots: string[]) {
  const prev = c.routes[key] ?? {};
  c.routes[key] = {
    round: 2,
    reference,
    referenceTotal,
    scores,
    total: scores.reduce((a, b) => a + b, 0),
    verdict,
    shots,
    scoreNotes,
    open,
    closed: [...(prev.closed ?? []).map((o: Record<string, unknown>) => ({ ...o, reverifiedRound: 2, reverify: 'Tur 2 yeniden ölçüm: kapalı kaldı' }))],
  };
}

setRoute('/kokpit?rol=admin', [4, 5, 4, 5, 5, 4, 5, 5, 4, 5, 5, 5], 'stripe', 56, 'KAZANAN: Stripe', [
  O('kokpit-skt-mobile-card-01', 3, 'P1',
    '390px’te "SKT riski" listesi 3 satırlık anatomiyle (lot kodu / ürün adı / SKT rozeti ayrı satırlarda) 84.5px’lik kart üretiyor; puan kartı hedefi 56-72px. Aynı panodaki "Bugün" (65.5px) ve "Geciken alacak" (63.5px) 2 satırlık anatomiyle hedefin içinde — kaymayı yalnızca SKT satırı yapıyor.',
    '390x844 rowStats: SKT riski min 84 / max 85px (artifacts/critic/probe-kokpit-r2/admin-390x844.json)',
    'mobil kart ≤72px: LotBadge ile ExpiryBadge tek sm:contents grubuna alınıp 2 satırlık anatomiye insin',
    'apps/web/src/modules/kokpit/components/gm-dashboard.tsx:186-205'),
  O('kokpit-14px-tier-01', 1, 'P2',
    'Gövde metni için iki komşu kademe var: tüm liste satırları 13px, ama BreakEvenPanel’in dört satırı ve ChannelBars’ın tek-kanal satırı text-sm (14px). 1px’lik fark hiçbir anlam taşımıyor. ChannelBars kendi içinde de tutarsız: çok kanallı halde etiket 12px, tek kanallı halde 14px.',
    '1440x900 font-size dağılımı (admin): 14px’te 7 element — PageHeader alt başlığı (1, shell) + BreakEvenPanel (4) + ChannelBars tek-kanal (1) + EmptyState başlığı (1, shell)',
    'kokpit’e ait 14px element 0: BreakEvenPanel satırları ve ChannelBars tek-kanal satırı 13px’e insin',
    'apps/web/src/modules/kokpit/components/shared.tsx:195-206 + channel-bars.tsx:31-34'),
  O('kokpit-statstrip-zero-01', 6, 'P2',
    'StatStrip sıfır değerleri tam kontrastla basıyor: "Onay kuyruğu"nda 0/12/0/0 dördünün rengi aynı. Uygulamanın kendi kuralı (MoneyCell) sıfırı zaten soluk basıyor (€0,00 %70 opaklık) — aynı ekranda iki farklı sıfır dili.',
    '1440x900: 6 sıfır değerin 6’sı oklch(0.21 0.006 285.9) — sıfır olmayanlarla birebir aynı; MoneyCell €0,00 ise oklab(..., 0.7)',
    'StatStrip value=0 iken text-muted-foreground; ekranda tam kontrastlı sıfır sayısı 0',
    'apps/web/src/modules/kokpit/components/shared.tsx:113'),
  O('kokpit-kpi-dupe-01', 3, 'P2',
    '"Bugünkü net ciro ₺2.678 ↓%67,8 dünden" KPI şeridinde; 130px altında "Günlük kanal satışları" kartının içinde "Net (bugün)" olarak birebir aynı değer+delta ile tekrar; üçüncü kez de kanal satırında (İhracat ₺2.678).',
    '1440x900: aynı (değer, delta) çiftini taşıyan KPI bloğu 2 adet',
    'tekrar eden KPI bloğu 0 — kart içindeki "Net (bugün)" kaldırılsın ya da şerit KPI’si başka bir ölçüye ayrılsın',
    'apps/web/src/modules/kokpit/components/gm-dashboard.tsx:44-48'),
], {
  '1': '4 — h1 24/600, KPI 19px, StatStrip 15px, gövde 13px, etiket 10-12px: sayısal merdiven Tur 1’de 5 kademeden 2’ye indi (kokpit-numeric-scale-01 kapalı). Kalan kusur: 14px’lik yetim gövde kademesi.',
  '2': '4→5 — kolon yükseklikleri 1290px / 1445px (fark 155px, hedef ≤200px; Tur 1’de 920px). Sayfa kenarı 24px, kart arası gap-4, kart içi 16px.',
  '3': '5→4 — masaüstü yoğunluğu korunuyor (24 satır, contentBottom 1721px, ilk ekranda ~15 satır), ama bu tur mobil kart yüksekliği ilk kez ölçüldü: SKT riski 84.5px (hedef 56-72). Ayrıca aynı KPI 3 kez tekrar ediyor.',
  '4': '4→5 — ChannelBars’daki ikinci hue (mavi chart-2) kalktı, tüm veri çubukları tek yeşil ton. distinctColors 23; doygun yeşil yalnızca durum rozetleri + marka işareti.',
  '5': '4→5 — kutu içinde kutu kalmadı (strip variant), hairline satır ayracı, sağ hizalı sayılar, satır hoverı var, scrollWidth = clientWidth. "Bugün"de partner sütunu 104px’e sıkışıyor ama satır gerçekten dolu (ölü alan yok) — yoğun listede kabul edilebilir kesme.',
  '6': '3→4 — NumberFlow kırpması kapandı (1440x900’de kesilen değer 0), tabular-nums ve 0/2 basamak notasyonu tutarlı. Kalan: sıfır değerler soluk değil.',
  '7': '4→5 — kokpit/loading.tsx eklendi, (app)/error.tsx mevcut, ekrandaki tek boş durum ("Kritik stok yok") ikon+başlık+açıklama+eylem taşıyor.',
  '8': '5 — RowLink hover:bg-muted/40 + focus-visible:ring-2 ring-inset; hover Tailwind v4’te @media (hover: hover) ile korunuyor.',
  '9': '4 — 390px’te yatay taşma yok (scrollWidth = clientWidth = 390), dokunma hedefi <44px yok, tek kolon. Kalan: SKT satırları 84.5px.',
  '10': '5 — lucide 16px, süs ikonu yok, metinle hizalı.',
  '11': '4→5 — StatStrip / ExpiryBucketStrip / AgingStrip / ProductionLineRow / BreakEvenPanel / TodayRow tek paylaşılan bileşen; üç farklı mini şerit anatomisi tek anatomiye indi (hücreler 59.5px).',
  '12': '4→5 — çerçeve içinde çerçeve yok, ikon çorbası yok, default HTML görünümü yok.',
}, ['artifacts/screens/kokpit-admin/desktop.png', 'artifacts/screens/kokpit-admin/mobile.png']);

setRoute('/kokpit?rol=depo', [5, 5, 4, 5, 4, 4, 5, 5, 4, 5, 5, 4], 'linear', 57, 'KAZANAN: Linear', [
  O('kokpit-depo-row-void-02', 5, 'P1',
    '"Bugün" bölümü lg:col-span-2 ile 1152px genişlikte ama satırın kendisi sm:max-w-3xl (768px) ile sınırlı — Tur 1’deki satır İÇİ 930px’lik boşluk kapandı, yerine her satırın SAĞINDA 368px’lik kullanılmayan kolon oluştu. Görsel sonuç aynı: tam genişlik bir kartın içinde 2/3 dolu bir tablo.',
    '1440x900: bölüm 1152px, satır bağlantısı 768px (linkL 265 → linkR 1033; kart iç sağ kenarı 1385) → satır sonu ölü alan 352-368px, son metin öğesinden kart kenarına 504px',
    'satır sonu ölü alan ≤24px: ya bölüm lg:col-span-2 olmaktan çıksın ya da satır tam genişliğe yayılıp rozet/tutar kart kenarına sağ hizalansın',
    'apps/web/src/modules/kokpit/components/depo-dashboard.tsx:75-84'),
  O('kokpit-depo-mobile-card-02', 3, 'P1',
    '390px’te "Karantina" (83.5px) ve "SKT riski" (84.5px) satırları 3 satırlık anatomi (rozet / ürün adı / konum+tutar) üretiyor; puan kartı hedefi 56-72px. Aynı panodaki "Bugün" (65.5px) hedefin içinde.',
    '390x844 rowStats: Karantina 83-84px, SKT riski 84-85px, Bugün 65-66px (artifacts/critic/probe-kokpit-r2/depo-390x844.json)',
    'mobil kart ≤72px — LotBadge sağındaki rozet/konum ile tek satır paylaşsın (2 satırlık anatomi)',
    'apps/web/src/modules/kokpit/components/depo-dashboard.tsx:41-50, 62-70'),
], {
  '1': '5 — h1 24/600, gövde 13px, etiket 10-12px, mono 12px belge no. Bu kesitte 14px yalnızca PageHeader alt başlığı (shell).',
  '2': '5 — kolonlar 269px / 331px (fark 62px), gap-4, sayfa kenarı 24px.',
  '3': '3→4 — Tur 1’deki 6 satır / %20 boş ilk ekran gitti: 19 satır, contentBottom 1118px, karantina artık en değerli 5 lotu listeliyor. Kalan: mobil kart 83-84px.',
  '4': '5 — distinctColors 24; karantina noktaları amber, durum rozetleri yeşil/amber/gri, başka hue yok.',
  '5': '4 — hairline ayraç, sağ hizalı tutar, hover, taşma yok; ama "Bugün" kartının sağında 368px kullanılmayan kolon.',
  '6': '5→4 — tabular-nums ve 0/2 basamak notasyonu tutarlı; ekrandaki tek sıfır (SKT 60-90 gün) tam kontrastlı — kokpit-statstrip-zero-01 ile aynı kök.',
  '7': '4→5 — kokpit/loading.tsx eklendi; bu kesitte boş durum render edilmiyor (tüm listeler dolu).',
  '8': '5 — hover / focus-visible / active tutarlı.',
  '9': '4 — yatay taşma yok, dokunma hedefi <44px yok; ama iki listede kart 83-84px.',
  '10': '5 — 16px ikon, LotBadge nokta göstergesi, süs yok.',
  '11': '4→5 — SKT şeridi GM ile birebir aynı (ExpiryBucketStrip, hücre 59.5px), TodayRow paylaşılıyor.',
  '12': '4 — çerçeve çorbası yok ama tam genişlik kartın içinde 2/3 dolu tablo "bitmemiş yönetim paneli" hissi veriyor.',
}, ['artifacts/screens/kokpit-depo/desktop.png', 'artifacts/screens/kokpit-depo/mobile.png']);

setRoute('/kokpit?rol=muhasebe', [4, 5, 5, 5, 5, 4, 4, 5, 4, 5, 5, 5], 'stripe', 56, 'KAZANAN: Stripe', [
  O('kokpit-empty-action-02', 7, 'P1',
    '"Bugünün tahsilatları" boş durumu 190px’lik kartı yalnızca ikon + "Bugün tahsilat yok" başlığı için harcıyor — açıklama da eylem de yok. Tur 1’de açılan kokpit-empty-action-01 yalnızca 2 boş duruma eylem ekleyip kapatılmıştı; kokpitteki 14 compact EmptyState’in 12’si hâlâ çıplak.',
    '1440x900: bölüm yüksekliği 190px, içerik = 1 ikon + 1 başlık; EmptyState action/description prop’u geçilmiyor',
    'ikon + başlık + açıklama + eylem (ör. "Tahsilat kaydet" → /finans/tahsilat) — puan kartı kriter 7 tanımı',
    'apps/web/src/modules/kokpit/components/finance-dashboard.tsx:73-77'),
  O('kokpit-kdv-strip-mobile-01', 9, 'P1',
    '390px’te "KDV pozisyonu" 4 sütunlu StatStrip olarak kalıyor; hücre genişliği ~85px’e düşüp etiketlerin 2’si kırpılıyor ("Hesaplanan (...", "İndirilecek (1...") ve ilk hücrenin değeri ("Ağustos 2026") iki satıra sarıp hücreyi yükseltiyor.',
    '390x844: StatStrip 4 sütun, 4 etiketin 2’si truncate ile kesik; "Ağustos 2026" 2 satır (artifacts/screens/kokpit-muhasebe/mobile.png)',
    '<640px’te 2 sütun (grid-cols-2) — kırpılan etiket 0, hücre yükseklikleri eşit',
    'apps/web/src/modules/kokpit/components/shared.tsx:104-108 (StatStrip gridTemplateColumns) + finance-dashboard.tsx:95-109'),
], {
  '1': '5→4 — hiyerarşi sağlam (h1 24/600, KPI 19px, StatStrip 15px, gövde 13px) ama BreakEvenPanel’in 4 satırı 14px: gövde için iki komşu kademe (kokpit-14px-tier-01, admin kesitinde açık).',
  '2': '4→5 — kolonlar 842px / 726px (fark 116px, hedef ≤120px; Tur 1’de 246px). Tek satırlık bölüm kalmadı.',
  '3': '4→5 — 15 satır (hedef ≥15), "Mutabakat kuyruğu" artık 8 satırlık gerçek liste, tek sayaca kart harcanmıyor.',
  '4': '3→5 — distinctColors 15 (tüm kesitlerin en temizi); negatif tutarlar KPI şeridinde de MoneyCell’de de aynı kırmızı; nakit projeksiyonundaki dekoratif yeşil kalktı.',
  '5': '4→5 — KDV pozisyonu artık divide-x StatStrip; tüm satırlar 44px, hairline ayraç, sağ hizalı tutar, taşma yok.',
  '6': '4 — nakit projeksiyonundaki karışık notasyon kapandı (ikisi de tam basamaklı), tabular-nums var; kalan: 3 adet ₺0 tam kontrastlı — MoneyCell’in soluk-sıfır kuralıyla çelişiyor.',
  '7': '4 — loading.tsx eklendi ama ekrandaki tek boş durum ("Bugün tahsilat yok") eylemsiz ve açıklamasız.',
  '8': '5 — hover / focus tutarlı.',
  '9': '4 — "Geciken alacak" satırları 63px’e indi (Tur 1: 84px), yatay taşma yok; kalan: KDV şeridi 390px’te 4 sütun kalıp etiket kırpıyor.',
  '10': '5 — banka satırlarında 16px ikon, başka süs ikonu yok.',
  '11': '4→5 — BreakEvenPanel GM ile tek kod; KDV / aging / nakit şeritleri tek StatStrip anatomisi.',
  '12': '4→5 — kutu içinde kutu yok, ayraçsız blok kalmadı.',
}, ['artifacts/screens/kokpit-muhasebe/desktop.png', 'artifacts/screens/kokpit-muhasebe/mobile.png']);

setRoute('/kokpit?rol=satis', [4, 4, 4, 5, 4, 5, 5, 5, 5, 5, 5, 4], 'stripe', 56, 'KAZANAN: Stripe', [
  O('kokpit-satis-col-balance-01', 2, 'P1',
    'İki kolonlu pano ızgarasında sol kolon 800px, sağ kolon 270px — fark 530px. "Son siparişler" 10 satırla sol kolonu doldururken sağ kolonun altında yarım ekran boş kalıyor; aynı anda sol kolondaki partner adları 102px’e sıkışıyor.',
    '1440x900: kolon yükseklikleri 800px / 270px (artifacts/critic/probe-kokpit-r2/satis-1440x900.json)',
    'kolon yükseklik farkı ≤200px — "Son siparişler" sağ kolona ya da lg:col-span-2 alt şeride taşınsın',
    'apps/web/src/modules/kokpit/components/sales-dashboard.tsx:36-113'),
  O('kokpit-satis-order-trunc-01', 5, 'P1',
    '"Son siparişler"de partner+kanal metni 102-146px’lik kutuya sıkışıyor (gerçek metin 180-404px): 10 satırın 8’inde "· kanal" eki TAMAMEN görünmez oluyor, partner adı ~14 karakterde kesiliyor — satırın sonunda 103px, bölümün sağında 568px boş alan dururken.',
    '1440x900: truncate kutuları clientWidth 102/109/118/134/146px, scrollWidth 180/199/229/320/404px (10 satırın 8’i kırpılı); satır sonu boş 103px',
    'partner sütunu ≥220px ve kırpılan satır ≤2/10 — tarih (sm:w-24) + belge no (sm:w-32) sütunları daraltılsın ya da bölüm geniş kolona taşınsın',
    'apps/web/src/modules/kokpit/components/sales-dashboard.tsx:66-84'),
], {
  '1': '5→4 — tek kanal durumunda ChannelBars etiketi 14px (çok kanallı halde 12px): aynı bileşen iki farklı kademe basıyor.',
  '2': '5→4 — Tur 1’de eklenen "Son siparişler" yoğunluğu çözdü ama tamamı sol kolona eklendiği için kolon dengesi bozuldu (800/270, fark 530px).',
  '3': '3→4 — toplam 19 satır (Tur 1: 9), contentBottom 1076px; ama ilk ekranın sağ yarısı 546px’ten sonra boş.',
  '4': '3→5 — kanal çubuğu ile huni çubuğu tek RankBar (8px, rounded-full, tek hue); doygun yeşil yüzey sayısı 4’ten 1’e indi.',
  '5': '4 — hairline / hover / sağ hizalama tamam, çubuk anatomisi tekleşti; kalan: partner sütunu 102px’e sıkışıp 8 satırda kanal eki kayboluyor.',
  '6': '5 — tabular-nums, QtyCell birimi ayrı ve muted, MoneyCell 2 basamak; ekranda sıfır değer yok.',
  '7': '4→5 — loading.tsx eklendi; bu kesitte boş durum render edilmiyor.',
  '8': '5 — hover / focus tutarlı.',
  '9': '4→5 — "En çok satan 5" artık RowLink (mobilde 2 satır, 63.5px), "Son siparişler" 65.5px, yatay taşma yok, dokunma hedefi <44px yok.',
  '10': '5 — süs ikonu yok.',
  '11': '4→5 — tüm listeler RowLink, çubuklar RankBar; kokpitte etkileşimsiz liste kalmadı.',
  '12': '4 — ekranın sağ yarısı boşken sol yarıda adların kesilmesi "bitmemiş yönetim paneli" hissi veriyor.',
}, ['artifacts/screens/kokpit-satis/desktop.png', 'artifacts/screens/kokpit-satis/mobile.png']);

setRoute('/kokpit?rol=uretim', [5, 4, 4, 5, 4, 4, 4, 5, 4, 5, 5, 4], 'linear', 57, 'KAZANAN: Linear', [
  O('kokpit-wo-wrap-01', 5, 'P1',
    '"Son iş emirleri"nde hat adı 96px’lik sabit sütunda (sm:w-24) truncate OLMADAN basılıyor — 8 satırın 6’sında "Bazlar, Barista & Kremalar" / "Toz Karıştırma & Dolum" iki satıra sarıp 44px’lik satırın içini tıkıyor, liste dikey ritmi tarağımsı görünüyor. Aynı tabloda 4. sütun aynı konumda ya bitiş tarihi ya üretilen miktar basıyor (tek sütun, iki veri tipi).',
    '1440x900: 8 satırın 6’sında hat adı 2 satır (sm:w-24 = 96px, en uzun ad ~168px); 4. sütunda 4 satır tarih + 4 satır "0 ADET"',
    'hat adı tek satır (truncate ya da sm:w-32 = 128px) — sarılan satır 0; 4. sütun tek veri tipi taşısın',
    'apps/web/src/modules/kokpit/components/production-chief-dashboard.tsx:93-105'),
  O('kokpit-uretim-col-balance-01', 2, 'P1',
    'İki kolon 695px / 405px — fark 290px (hedef ≤200px). Sağ kolon 681px’te bitip altında ~290px boş kalırken sol kolonda "Fire kırılımı" 190px’lik kartı boş durum için harcıyor.',
    '1440x900: kolon yükseklikleri 695px / 405px (artifacts/critic/probe-kokpit-r2/uretim_sefi-1440x900.json)',
    'kolon yükseklik farkı ≤200px',
    'apps/web/src/modules/kokpit/components/production-chief-dashboard.tsx:33-115'),
  O('kokpit-line-row-collision-01', 9, 'P1',
    '390px’te "Hat durumu" satırının alt satırında iki metin çakışıyor: kırpılmış "WO-2026-000007 · Strawberry Protein Mi…" ile "1 açık iş emri" arasında 0px boşluk var, tek bozuk dizge gibi okunuyor. Kök neden: sarmalayıcı flex justify-between’de gap tanımlı değil, sol kutu min-w-0 truncate ile tüm genişliği alıyor.',
    '390x844: iki komşu leaf metin kutusu arası gap 0px (artifacts/critic/probe-kokpit-r2/uretim_sefi-390x844.json collisions[0])',
    'komşu metinler arası boşluk ≥8px (sarmalayıcıya gap-2 / gap-3)',
    'apps/web/src/modules/kokpit/components/shared.tsx:270-276 (ProductionLineRow alt satırı)'),
  O('kokpit-empty-action-03', 7, 'P1',
    '"Fire kırılımı (7 gün)" boş durumu 190px’lik kartı yalnızca ikon + "Son 7 günde fire kaydı yok" başlığı için harcıyor — açıklama ve eylem yok (kokpit-empty-action-01 eksik kapatılmıştı).',
    '1440x900: bölüm 190px; EmptyState action/description prop’u geçilmiyor',
    'ikon + başlık + açıklama + eylem',
    'apps/web/src/modules/kokpit/components/production-chief-dashboard.tsx:50-63'),
], {
  '1': '5 — h1 24/600, gövde 13px, meta 11-12px; bu kesitte 14px yalnızca shell bileşenlerinden (PageHeader alt başlığı + EmptyState başlığı) geliyor.',
  '2': '3→4 — Tur 1’deki tek bölümlü / yarı boş pano gitti (4 bölüm), 8pt ritmi temiz; ama kolon farkı 290px.',
  '3': '2→4 — contentBottom 481px’ten 971px’e, satır sayısı 3’ten 15’e çıktı; kalan: sağ kolon 681px’ten sonra boş + 190px’lik boş durum kartı.',
  '4': '5 — distinctColors 24; yeşil / amber / gri durum rozetleri + tek mavi "Planlandı" rozeti anlam taşıyor, dekoratif renk yok.',
  '5': '3→4 — RowLink padding hatası kapandı (satır 72.5px, GM ile birebir), hairline / hover / sağ hizalama tamam; kalan: sarılan hat adı + karışık 4. sütun + "Son duruşlar" satır sonunda 363px ölü alan.',
  '6': '5→4 — tabular-nums ve QtyCell birimi tamam; ama "Geciken iş emri 0", "Fire oranı %0" ve "0 ADET" tam kontrastlı — soluk sıfır kuralı uygulanmıyor.',
  '7': '2→4 — loading.tsx eklendi (Tur 1 P2 kapandı); ama ekrandaki boş durum eylemsiz / açıklamasız.',
  '8': '5 — hover / focus tutarlı.',
  '9': '5→4 — kartlar 65.5px, yatay taşma yok, dokunma hedefi <44px yok; ama 390px’te ölçülen 0px metin çakışması var.',
  '10': '5 — süs ikonu yok.',
  '11': '4→5 — ProductionLineRow artık GM ile tek bileşen (ikisi de 72.5px, pt/pb 10px), StatStrip paylaşılıyor.',
  '12': '4 — sarılan ragged satırlar + boş sağ kolon + 363px’lik satır sonu boşluğu.',
}, ['artifacts/screens/kokpit-uretim_sefi/desktop.png', 'artifacts/screens/kokpit-uretim_sefi/mobile.png']);

writeFileSync(p, JSON.stringify(c, null, 1));
for (const [k, v] of Object.entries<Record<string, unknown>>(c.routes)) {
  console.log(k, v.total, '/', v.referenceTotal, 'open:', (v.open as unknown[]).length, v.verdict);
}

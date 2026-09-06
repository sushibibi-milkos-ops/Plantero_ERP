/** Tur 5 — gorsel-critic bakım puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as any;
const R = 5;
card.round = R;
card.measuredAt = '2026-09-06';
card.note =
  "Tur 5 — gorsel-critic. Builder'ın Tur 5 düzeltmeleri yeniden ölçüldü. GERÇEKTEN KAPANANLAR: /bakim/makineler 01/02/03/04/05/06 (KpiStripRow 80px, tableTop 300, rowsAboveFold 15/36, mobil kart 63.5px, 0 KPI ikonu, loading.tsx gerçek düzenle birebir) → 55→60; /bakim/planlar 03 (iskelet araç çubuğu + 12 satır) → 59→60; /bakim/is-emirleri 07/08 (boş kanban sütunlarında kesik çerçeveli yer tutucu, kart başlığı line-clamp-2) → 57→59; /bakim/oee 03 (çip data-pressable) ve 06 (4 seri = 4 farklı stroke/dash). AÇILAN/YENİDEN AÇILAN: /bakim/is-emirleri/yeni — bakim-yeni-02 YANLIŞ ölçümle kapatılmış (belge yüksekliği sağ rayla doldu, ana sütun hâlâ 592px boş) ve düzeltme iki yeni kusur getirdi (h1 264px ↔ form 538px, 274px kaçık; 36 makinelik iç kaydırmalı MachineQuickList dolgusu) → 58→57, KAZANAN: Linear. /bakim/oee — boşluk her zaman boş kalacak bir kartla dolduruldu (oee_records: 90 kayıt, machine_id dolu 0) ve boş durum metni DB tablo/kolon adı sızdırıyor; ayrıca 390px'te Recharts tooltip etkileşimsiz açılışta görünüyor (3/3 tekrar) → 56, KAZANAN: Stripe. Kod düzeyi tarama temiz: bakım modülünde transition-all / transition:all / ease-in / >300ms / scale(0) yok; hover globals.css @custom-variant ile (hover:hover) and (pointer:fine) altında.";

const routes = card.routes as Record<string, any>;

const closeFinding = (route: string, id: string, measureAfter: string, fixNote: string) => {
  const r = routes[route];
  const i = (r.open ?? []).findIndex((o: any) => o.id === id);
  if (i < 0) return;
  const [f] = r.open.splice(i, 1);
  r.closed = r.closed ?? [];
  r.closed.push({ ...f, closedRound: R, verifiedBy: 'ölçüm (gorsel-critic Tur 5)', measureAfter, fixNote });
};

// --- /bakim/makineler
routes['/bakim/makineler'] = {
  ...routes['/bakim/makineler'],
  round: R,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  verdict: 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  scoreNotes:
    'Tur 5 delta (+5): k3 4→5 — tableTop 352→300px, rowsAboveFold 13→15/36, satır 36.5-37px @13px, mobil kart 76.7→63.5px (bant 56-72) [probe-bakim-r5-makineler.ts + pnpm measure]. k6 4→5 — "Çalışma saati" ve "Açık iş emri" sıfırları tek kural (QtyCell muted) [probe-bakim-r5-zero.ts]. k7 4→5 — loading.tsx artık KpiStripRow 72/80px + DataTableSkeleton(rows=15) + gerçek başlıklar, sıçrama yok. k10 4→5 — KPI ikonları kaldırıldı, `grep -rn "icon={<" apps/web/src` 0 sonuç. k11 4→5 — sayfa artık uygulamanın diğer 153 KpiCard kullanımıyla aynı variant="strip" dilinde. Ölçüm: scrollWidth 1440=1440 @1440, 390=390 @390, distinctColors 17/15, fontSizes {13:238, 11:110, 12:12} = 3 kademe, h1 24px/600.',
};
['bakim-makineler-01', 'bakim-makineler-02'].forEach(() => {});

// --- /bakim/planlar
routes['/bakim/planlar'] = {
  ...routes['/bakim/planlar'],
  round: R,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  verdict: 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  scoreNotes:
    'Tur 5 delta (+1): k7 4→5 — loading.tsx artık arama+filtre+sütun seçici yer tutucusu ve gerçek 7 sütun başlığı ile 12 satır basıyor (gerçek sayfa 12 satır) → sıçrama yok. Ölçüm: satır 36px × 12, scrollWidth 1440=1440 / 390=390, distinctColors 17/15, mobil kart 63.5px.',
};

// --- /bakim/is-emirleri
routes['/bakim/is-emirleri'] = {
  ...routes['/bakim/is-emirleri'],
  round: R,
  scores: [5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 59,
  verdict: 'KAZANAN: Plantero — 59 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok (k4=4, bakim-isemirleri-05 P2 açık).',
  scoreNotes:
    'Tur 5 delta (+2): k7 4→5 — boş kanban sütunlarında kesik çerçeveli sessiz yer tutucu ("Bu durumda iş emri yok", 3/5 sütun, 146px) [kanban.png]. k12 4→5 — kart başlığı line-clamp-2, harf ortasından kesme yok. k4=4 KALDI: distinctColors 25 @1440 liste görünümü (hedef ≤20); "Tür" sütunu nötre alındı (27→25) ama "Öncelik" + "Durum" iki ayrı renkli rozet sütunu yan yana duruyor.',
};

// --- /bakim/is-emirleri/[id]
routes['/bakim/is-emirleri/[id]'] = {
  ...routes['/bakim/is-emirleri/[id]'],
  round: R,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  verdict: 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  scoreNotes: 'Tur 5: değişiklik yok, yeniden doğrulandı (MO-2026-000006). Rozet+künye başlığı, 4 sütunlu tanım ızgarası + hairline ayraçlar, "Boş alanları göster (16)" kırpması, olay geçmişi zaman çizelgesi, alt aksiyon çubuğu; mobilde tek sütun, dokunma hedefleri ≥44px.',
};

// --- /bakim/makineler/[id]
routes['/bakim/makineler/[id]'] = {
  ...routes['/bakim/makineler/[id]'],
  round: R,
  scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  total: 60,
  verdict: 'KAZANAN: Plantero — 60 ≥ 57, hiçbir kriter < 4, açık P0/P1 yok.',
  scoreNotes: 'Tur 5: değişiklik yok, yeniden doğrulandı (MK-001). Altı çizgili sekmeler (sayaçlı), tanım ızgarası, "Son iş emirleri"/"Son duruşlar" iki sütun, OEE alan grafiği tek vurgu renginde.',
};

// --- /bakim/is-emirleri/yeni  (regresyon)
const yeni = routes['/bakim/is-emirleri/yeni'];
// bakim-yeni-02 yanlış kapatılmıştı → yeniden aç
const wrongClosed = (yeni.closed ?? []).findIndex((c: any) => c.id === 'bakim-yeni-02');
let reopened: any = null;
if (wrongClosed >= 0) reopened = yeni.closed.splice(wrongClosed, 1)[0];
yeni.round = R;
yeni.scores = [5, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 4];
yeni.total = 57;
yeni.verdict = 'KAZANAN: Linear — toplam 57 = 57 ama 3 açık P1 var (kazanma kuralı: açık P0/P1 yok).';
yeni.scoreNotes =
  'Tur 5 delta (−1): k11 4→5 — bakim-yeni-03 GERÇEKTEN kapandı, h1 sol kenar 264px ve modülün diğer 4 route\'u ile aynı oluk [probe-bakim-r5d.ts]. AMA k2 5→4 ve k12 5→4: bakim-yeni-02 "emptyBelow 563→−773" ölçümüyle kapatılmış; bu ölçüm BELGE yüksekliğini sağ rayla doldurmayı sayıyor, ana sütunu değil. Yeniden ölçüm (probe-bakim-r5e.ts @1440x900): "Vazgeç" butonunun altı y=337, docH=929 → ANA SÜTUNDA 592px ölü alan (hedef ≤200). Üstelik düzeltme iki yeni kusur getirdi: (a) h1 sol kenar 264px iken kendi formu 538px\'ten başlıyor (274px kaçık — sayfa başlığı ile formu aynı sol oluğu paylaşmıyor), (b) forma "MAKİNELER (36)" paneli eklenmiş: 320×483px kart içinde `max-h-[420px] overflow-y-auto` iç kaydırıcı, scrollHeight 1222 / clientHeight 420 (802px gizli), 72 odaklanabilir satır — /bakim/makineler tablosunun bir arıza bildirim formu içindeki kopyası. k3 4 KALDI (aynı 592px).';
yeni.open = [
  {
    ...(reopened ?? {}),
    id: 'bakim-yeni-02',
    criterion: 3,
    severity: 'P1',
    text: 'Masaüstünde (1440×900) ana sütun formun altında 592px boş kalıyor; Tur 5 "düzeltmesi" boşluğu kapatmadı, yalnızca sağ tarafa 320px\'lik dolgu paneli ekledi.',
    measure: 'Tur 5 yeniden ölçüm: "Vazgeç" butonu alt kenarı y=337, document.scrollHeight=929 → ana sütunda 592px ölü alan @1440x900 (scripts/probe-bakim-r5e.ts). Tur 4\'te kapatma gerekçesi olan "emptyBelow −773" belge yüksekliğini sağ rayla ölçüyor, ana sütunu değil.',
    target: 'ana sütunda emptyBelow ≤ 200px @1440x900 — ya form 2. adımının alanları (arıza türü/öncelik/açıklama/fotoğraf) ilk ekranda görünür olsun ya da sayfa telefon-öncelikli tek sütun kalıp masaüstünde tam genişliğe yayılsın',
    file: 'apps/web/src/app/(app)/bakim/is-emirleri/yeni/page.tsx (lg:grid-cols-[minmax(0,1fr)_320px]) + apps/web/src/modules/maintenance/components/report-breakdown-form.tsx (mx-auto max-w-xl)',
    openedRound: 2,
    reopenedRound: R,
  },
  {
    id: 'bakim-yeni-04',
    criterion: 2,
    severity: 'P1',
    text: 'Sayfa başlığı ile kendi formu aynı sol oluğu paylaşmıyor: h1 264px\'ten, QR alanı 538px\'ten başlıyor.',
    measure: 'h1 left=264px, input[placeholder*="QR"] left=538px → 274px kaçık @1440x900 (scripts/probe-bakim-r5d.ts / r5e.ts). Modülün diğer route\'larında içerik de h1 de 264px.',
    target: 'form sol kenarı = h1 sol kenarı (264px), sapma ≤ 8px @1440x900',
    file: 'apps/web/src/modules/maintenance/components/report-breakdown-form.tsx (`mx-auto max-w-xl`) — masaüstünde `lg:mx-0` ile sola hizalanmalı, ortalama yalnızca `<lg` altında kalmalı',
    openedRound: R,
  },
  {
    id: 'bakim-yeni-05',
    criterion: 12,
    severity: 'P1',
    text: 'Arıza bildirim formunun yanına 36 makinelik, iç kaydırıcılı bir liste paneli konmuş — formun kendi makine seçicisiyle (combobox) aynı işi yapan, kutu içinde kaydırma kutusu dolgusu.',
    measure: 'MachineQuickList kartı 320×483px @1440x900; içindeki `max-h-[420px] space-y-0.5 overflow-y-auto` kaydırıcı scrollHeight 1222 / clientHeight 420 (802px gizli), 72 odaklanabilir satır; kart alt kenarında son satır kırpılıyor (scripts/probe-bakim-r5e.ts). Formda zaten "Makine ara ve seç…" combobox\'ı var.',
    target: 'sayfa içinde iç kaydırıcılı liste paneli olmasın (scrollHeight ≤ clientHeight + 4); dolgu paneli yerine ana sütun genişletilsin ya da yalnızca "Son bildirilen arızalar" (3 satır) kalsın',
    file: 'apps/web/src/modules/maintenance/components/machine-quick-list.tsx + apps/web/src/app/(app)/bakim/is-emirleri/yeni/page.tsx',
    openedRound: R,
  },
];

// --- /bakim/oee
const oee = routes['/bakim/oee'];
closeFinding('/bakim/oee', 'bakim-oee-04', '', '');
oee.round = R;
oee.scores = [5, 5, 4, 5, 5, 5, 4, 5, 4, 5, 5, 4];
oee.total = 56;
oee.verdict = 'KAZANAN: Stripe — toplam 56 = 56 ama 3 açık P1 var (kazanma kuralı: açık P0/P1 yok).';
oee.scoreNotes =
  'Tur 5 delta (net 0): k8 4→5 — bakim-oee-03 kapandı, hat çipleri `a[data-pressable]` taşıyor, globals.css:181 basılı-ölçek kuralı eşleşiyor. k5=5 KALDI — bakim-oee-06 kapandı, 4 seri 4 ayrı stroke/dash: var(--chart-1) 2px düz, muted 90% 1px düz, muted 62% dash 4/3, muted 40% dash 1/3 (probe-bakim-r5e.ts). AMA k12 5→4 ve k7 5 olamadı (4 kaldı): bakim-oee-02 boşluğu KAPATMADI, boşluğu her zaman boş kalacak bir kartla doldurdu — `select count(*), count(machine_id) from oee_records` → 90 / 0, yani "Makine bazlı OEE" kartı (1152×250px masaüstü, 358×270px mobil) mevcut veriyle daima "veri yok" basıyor; üstelik boş durum açıklaması son kullanıcıya veritabanı tablo/kolon adı gösteriyor ("oee_records tablosunda machine_id dolu kayıt bulunmuyor.", ayrıca yukarıda "Worker `oee-daily` her gece 23:30\'da hesaplar."). k9=4 KALDI: mobil KPI şeridi (bakim-oee-04, P2) + YENİ P1 — 390px\'te OEE trendi tooltip\'i hiçbir etkileşim olmadan açılışta görünüyor (161×118px, 3/3 tekrarda aynı, scripts/probe-bakim-r5g.ts).';
oee.open = [
  {
    id: 'bakim-oee-07',
    criterion: 9,
    severity: 'P1',
    text: '390px\'te "OEE trendi" grafiğinin tooltip\'i sayfa açılışında, hiçbir dokunuş/işaretçi olayı olmadan görünür durumda geliyor ve grafiğin ortasını kapatıyor.',
    measure: '.recharts-tooltip-wrapper visibility=visible, 161×118px, top=424 left=73, transform translate(40px,90px), içerik "21.08.2026 OEE %0 …" — 3/3 tekrarda aynı, etkileşimsiz açılışta @390x844 (scripts/probe-bakim-r5g.ts). @1440x900\'de visibility=hidden.',
    target: '@390x844 etkileşimsiz açılışta görünür .recharts-tooltip-wrapper yok (visibility=hidden veya genişlik 0)',
    file: 'apps/web/src/modules/maintenance/components/oee-charts.tsx:70 (<Tooltip content={<TrendTooltip />} …>)',
    openedRound: R,
  },
  {
    id: 'bakim-oee-08',
    criterion: 7,
    severity: 'P1',
    text: 'Boş durum metinleri son kullanıcıya veritabanı ve altyapı iç adlarını gösteriyor.',
    measure: 'page.tsx:90 EmptyState description="oee_records tablosunda machine_id dolu kayıt bulunmuyor."; page.tsx:68 description="Worker `oee-daily` her gece 23:30\'da hesaplar." — ekranda birebir bu metinler basılıyor (artifacts/screens/bakim-oee/desktop.png, mobile.png).',
    target: 'boş durum açıklamalarında tablo/kolon/worker adı geçmesin; kullanıcı diliyle ne yapılacağını söylesin (ör. "Makine bazlı kırılım için üretim kayıtlarına makine bilgisi girilmeli.")',
    file: 'apps/web/src/app/(app)/bakim/oee/page.tsx:68, 90',
    openedRound: R,
  },
  {
    id: 'bakim-oee-09',
    criterion: 3,
    severity: 'P1',
    text: '"Makine bazlı OEE" kartı mevcut veriyle daima boş — dikey boşluk, sıfır bilgi taşıyan 250px\'lik bir "veri yok" kartıyla dolduruldu (bakim-oee-02\'nin yan etkisi).',
    measure: 'Kart 1152×250px @1440x900 (top=655, bottom=905 — ilk ekranın alt yarısı) ve 358×270px @390x844; içerik yalnızca EmptyState. DB: `select count(*) total, count(machine_id) from oee_records` → 90 / 0 (machine_id dolu kayıt yok).',
    target: 'ya kart gerçek veri göstersin (machines.length > 0) ya da veri yokken hiç render edilmesin; boşluk bilgi taşıyan içerikle kapatılsın (ör. hat bazlı OEE tablosu — line_id dolu)',
    file: 'apps/web/src/app/(app)/bakim/oee/page.tsx:84-110 + packages/…/maintenance queries getOeeDashboard().machines',
    openedRound: R,
  },
  {
    id: 'bakim-oee-04',
    criterion: 9,
    severity: 'P2',
    text: 'Mobilde 5 kartlık KPI şeridinde ilk ekranda yalnızca 2 kart tam görünüyor; 3. kart ("Performans") etiket ortasından kesik.',
    measure: 'Tur 5 (yeniden ölçüldü, değişmedi): KpiStripRow scrollWidth 792 > clientWidth 358 @390x844; kart 152px, 3. kart left=336 → 390px kenarında kesiliyor. Belge kökünde taşma yok (390=390).',
    target: 'mobilde ya 2 sütunlu ızgara (2×2+1) ya da ilk ekranda en az 3 kartın tamamı görünsün',
    file: 'apps/web/src/components/kpi-strip.tsx (ortak bileşen — kök neden shell\'e ait; burada yalnızca etkisi izleniyor)',
    openedRound: 3,
  },
];

writeFileSync(path, JSON.stringify(card, null, 1) + '\n');
console.log('bakim.json güncellendi — tur', R);

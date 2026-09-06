/** Tur 3 — artifacts/critic/bakim.json kalıcı puan kartını günceller (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

type Finding = {
  id: string; criterion: number; severity: 'P0' | 'P1' | 'P2'; text: string;
  measure: string; target: string; file: string; openedRound: number;
  closedRound?: number; verifiedBy?: string; measureAfter?: string; fixNote?: string;
};
type Route = { round: number; reference: string; referenceTotal: number; scores: number[]; total: number; verdict: string; scoreNotes: string; open: Finding[]; closed: Finding[] };

const path = 'artifacts/critic/bakim.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as { module: string; round: number; note: string; measuredAt: string; routes: Record<string, Route> };

const R = 3;
const get = (k: string) => card.routes[k]!;
const close = (r: Route, id: string, measureAfter: string, fixNote: string) => {
  const i = r.open.findIndex((f) => f.id === id);
  if (i < 0) return;
  const [f] = r.open.splice(i, 1);
  r.closed.push({ ...f!, closedRound: R, verifiedBy: 'ölçüm (pnpm shot + pnpm measure + scripts/probe-bakim-r3*.ts, Tur 3)', measureAfter, fixNote });
};
const patch = (r: Route, id: string, p: Partial<Finding>) => {
  const f = r.open.find((x) => x.id === id);
  if (f) Object.assign(f, p);
};
const add = (r: Route, f: Finding) => { if (!r.open.some((x) => x.id === f.id)) r.open.push(f); };
const set = (r: Route, scores: number[], verdict: string, notes: string) => {
  r.round = R; r.scores = scores; r.total = scores.reduce((a, b) => a + b, 0); r.verdict = verdict; r.scoreNotes = notes;
};

/* ---------------------------------------------------------------- /bakim/makineler */
{
  const r = get('/bakim/makineler');
  patch(r, 'bakim-makineler-01', { measure: 'Tur 3: kpiCardHeight 136px, toolbarTop 308px, tableTop 352px, rowsAboveFold 13/36 @1440x900 — Tur 1/2 ile birebir aynı' });
  patch(r, 'bakim-makineler-02', { measure: 'Tur 3: mobil kart yüksekliği 76.7px @390x844 (rows.heights [76.7,76.7,76.7], 36 kart) — değişmedi' });
  patch(r, 'bakim-makineler-03', { measure: "Tur 3: 'Çalışma saati' sıfırı span.num color oklch(0.21 0.006 285.9), 'Açık iş emri' sıfırı span.num.text-muted-foreground oklch(0.552 0.016 285.9) — 36/36 satır, değişmedi" });
  patch(r, 'bakim-makineler-04', { measure: 'Tur 3: loading.tsx hâlâ h-[104px] KPI × 4 + 8 × h-9 satır, araç çubuğu yer tutucusu 0 — gerçek: 136px KPI, 13 satır, 32px araç çubuğu (toolbarTop 308)' });
  set(r, [5, 5, 4, 5, 5, 4, 4, 5, 5, 5, 5, 5], 'Plantero',
    'Tur 3: bu route\'a düzeltme uygulanmadı; dört P2 bulgusu da yeniden ölçüldü, ölçümler Tur 2 ile birebir aynı — puanlar değişmedi. k3=4 (tableTop 352px, ilk ekranda 13/36 satır), k6=4 (aynı satırda iki sıfır kuralı), k7=4 (iskelet KPI 104px ≠ gerçek 136px, araç çubuğu yer tutucusu yok). Toplam 57 = referans (Linear 57), hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.');
}

/* ---------------------------------------------------------------- /bakim/planlar */
{
  const r = get('/bakim/planlar');
  patch(r, 'bakim-planlar-03', { measure: 'Tur 3: loading.tsx 6 × h-9 + araç çubuğu yer tutucusu yok; gerçek 12 satır (36px) + 32px araç çubuğu — değişmedi' });
  set(r, [5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5], 'Plantero',
    'Tur 3: Tur 2\'de kapanan tablo taşması yeniden doğrulandı (kök scrollWidth 1440 = clientWidth 1440 @1440x900, 8/8 sütun ekranda, kırpılan başlık 0, iç kap taşması 0). 12 satır × 36px, mobil kart 63.5px. k7=4 tek açık P2 (iskelet 6 satır / gerçek 12 satır, araç çubuğu yer tutucusu yok). Toplam 59 ≥ 57 → KAZANAN: Plantero.');
}

/* ---------------------------------------------------------------- /bakim/is-emirleri */
{
  const r = get('/bakim/is-emirleri');
  patch(r, 'bakim-isemirleri-05', { measure: 'Tur 3: distinctColors 27 @1440x900 liste görünümü (kıyas: /bakim/makineler 17, /bakim/planlar 17, /bakim/oee 14) — değişmedi' });
  patch(r, 'bakim-isemirleri-07', { measure: 'Tur 3: orders-board.tsx sütun gövdesi boş dizide hiçbir düğüm basmıyor (kod: `{cards.map(...)}` tek çocuk, boş durum dalı yok); pano görünümünde 5 sütunun 4\'ü 50px başlık şeridinden ibaret' });
  patch(r, 'bakim-isemirleri-08', { measure: 'Tur 3 (pano görünümü, --click "Kanban görünümü"): kart başlığı div.truncate scrollWidth 483 / 365 / 319 > clientWidth 244 — değişmedi' });
  set(r, [5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4], 'Plantero',
    'Tur 3 delta: k5 3→5 — liste tablosu taşması KAPANDI (bakim-isemirleri-09): kök scrollWidth 1440 = clientWidth 1440, tablo kabı 1152 = 1152, 8/8 sütun ekranda (son sütun sağ kenarı 1418 < 1440), kırpılan başlık 0, iç kap taşması 0. k7 4→? : iskelet KAPANDI (bakim-isemirleri-10) — loading.tsx artık 32px araç çubuğu + 36px başlık + 6×36px satır çiziyor, gerçek varsayılan (liste) görünümle aynı düzen; ama pano sütunlarının boş durumu (bakim-isemirleri-07) hâlâ açık, k7=4 kalıyor. k4=4 (distinctColors 27; tek satırda Tür+Öncelik+Durum üç renkli rozet sütunu), k12=4 (pano kart başlıkları 483/365/319 > 244 kırpılıyor). Toplam 57 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.');
}

/* ---------------------------------------------------------------- /bakim/is-emirleri/[id] */
{
  const r = get('/bakim/is-emirleri/[id]');
  close(r, 'bakim-isemirleri-detay-05',
    'Tur 3: `grep -rn "function StatCell" apps/web/src/modules/maintenance/` → 0 eşleşme; order-detail.tsx ve machine-detail.tsx ikisi de ortak `DetailFieldGroupsGrid` + `DetailFieldGroup` kullanıyor (kopya 0).',
    'İki dosyadaki birebir kopya StatCell kaldırıldı, ortak alan ızgarası bileşenine geçildi.');
  patch(r, 'bakim-isemirleri-detay-06', {
    severity: 'P1',
    measure: 'Tur 3: loading.tsx ≈356px (84px başlık bloğu + 64px 4×h-16 ızgara + 160px h-40 blok + boşluklar); gerçek sayfa contentBottom 827px (MO-2026-000006) / ≈1560px (MO-2026-000003) — 471-1200px sıçrama. İskelette 3 alan grubu başlığı, açıklama kartı, olay geçmişi, ilgili iş emirleri ve eylem çubuğu yer tutucusu YOK.',
    target: 'iskelet gerçek sayfanın bloklarını yansıtsın (3 alan grubu + açıklama + olay geçmişi + eylem çubuğu); yükseklik farkı ≤ 24px',
  });
  patch(r, 'bakim-isemirleri-detay-09', {
    severity: 'P1',
    measure: 'Tur 3: 390x844 → a "MK-011 — Silindirik toz mikser 200 kg (HAT2)" 138.6 × 35.5px (Tur 2: 61.4 × 19px — genişledi ama yükseklik hâlâ 44px altında); sayfadaki tek 44px altı gerçek etkileşimli hedef',
    target: 'bağlantının dokunma yüksekliği ≥ 44px (alan değerine `inline-flex min-h-11 items-center` ya da -my ile negatif margin)',
  });
  add(r, {
    id: 'bakim-isemirleri-detay-10', criterion: 6, severity: 'P1',
    text: "YENİ: 'Makine bilgisi' grubundaki Güç / Çalışma saati / Kapasite alanları ham numeric(18,4) dizesi olarak basılıyor — '5.0000 kW', '0.0000 sa'. 4 ondalık basamak hem anlamsız hem de sayfadaki diğer sayılarla (para MoneyCell 2 basamak, tarih tabular) tutarsız; ayrıca bu düğümlerde font-variant-numeric: normal — tablo rakamları yok.",
    measure: "Tur 3: order-detail.tsx:104-106 → node: `${machine.powerKw} kW` / `${machine.runtimeHours} sa` / `${machine.capacityPerHour} ${unit}`. Ölçüm: '5.0000 kW' fontVariantNumeric 'normal', '0.0000 sa' fontVariantNumeric 'normal' (MO-2026-000006); '1.0000 kW' / '0.0000 sa' (MO-2026-000003). Alan ızgarasındaki tarihler de fontVariantNumeric 'normal' ('06.09.2026 17:55').",
    target: "ondalık: kW ≤ 2 basamak, saat ≤ 1 basamak (0 ondalık tam sayıda); tüm sayısal alan değerleri `QtyCell` (font-variant-numeric: tabular-nums) üzerinden — ölçümde uzun-ondalık düğüm sayısı 0 ve sayısal alanlarda tabular-nums",
    file: 'apps/web/src/modules/maintenance/components/order-detail.tsx:104-106',
    openedRound: 3,
  });
  add(r, {
    id: 'bakim-isemirleri-detay-11', criterion: 11, severity: 'P1',
    text: "YENİ: Aynı makine alanı iki kardeş ekranda iki farklı biçimde görünüyor — /bakim/makineler/[id] 'Güç: 1 kW', 'Çalışma saati: 0 sa' (QtyCell: birim küçük + soluk, tabular-nums), /bakim/is-emirleri/[id] 'Güç: 1.0000 kW', 'Çalışma saati: 0.0000 sa' (ham dize, birim normal boyutta, tabular yok). Aynı bileşen/alan aynı görünmeli.",
    measure: "Tur 3: MK-001 için /bakim/makineler/[id] → '1 kW' + '0 sa' (span.num, tabular-nums); MO-2026-000003 (aynı makine) /bakim/is-emirleri/[id] → '1.0000 kW' + '0.0000 sa' (tabular normal). Aynı iki alan, iki farklı çıktı.",
    target: 'iki ekranda da aynı bileşen (QtyCell) ve aynı çıktı dizesi — karşılaştırmalı ölçümde fark 0',
    file: 'apps/web/src/modules/maintenance/components/order-detail.tsx:104-106 (kıyas: machine-detail.tsx:33-36)',
    openedRound: 3,
  });
  set(r, [5, 5, 5, 5, 5, 3, 4, 5, 4, 5, 4, 5], 'Linear',
    "Tur 3 delta: sayfa yeniden kuruldu (DetailFieldGroupsGrid + olay geçmişi + ilgili iş emirleri + eylem çubuğu). k3 4→5 (contentBottom 497→827px, emptyBelow 404→74px; olay geçmişi geldi), k4 4→5 (rozet renkleri anlam taşıyor, öncelik nötr basılıyor; distinctColors 22), k5 4→5 (tek satırlık bilgi için tam genişlik kutu kalmadı; alan ızgarası hairline), k11 4→4 (StatCell kopyası kapandı ama YENİ tutarsızlık: aynı makine alanı iki ekranda iki biçim — detay-11), k12 4→5 (11 kutu → 2 kart + hairline ızgara). DÜŞÜŞ: k6 5→3 — 'Güç 5.0000 kW' / 'Çalışma saati 0.0000 sa' ham numeric(18,4), 4 ondalık ve font-variant-numeric normal; alan ızgarasındaki tarihler de tabular değil (detay-10). k7=4 (iskelet ≈356px, gerçek 827-1560px; açıklama/olay geçmişi/eylem çubuğu yer tutucusu yok), k9=4 (MK-011 bağlantısı 138.6×35.5px < 44px). Toplam 55 < 57 VE k6=3 < 4 → KAZANAN: Linear. Yakınsama (§7): k6 (+2), k7 (+1), k9 (+1), k11 (+1) bulguları P1'e alındı — dördü kapanınca 60 ≥ 57.");
}

/* ---------------------------------------------------------------- /bakim/makineler/[id] */
{
  const r = get('/bakim/makineler/[id]');
  close(r, 'bakim-makine-detay-02',
    "Tur 3: makine notu artık DetailFieldGroupsGrid içinde 'Not' etiketli bir alan (machine-detail.tsx:43 `{ label: 'Not', value: machine.note }`); ızgara altında etiketsiz çıplak metin satırı 0 — bkz. artifacts/screens/bakim-makineler-c362ef28-.../desktop.png.",
    "Not, diğer alanlarla aynı tanım listesi biçiminde 'Not' etiketiyle basılıyor.");
  close(r, 'bakim-makine-detay-06',
    'Tur 3: gri dolgulu yüzey sayısı 9 → 0. 8 × bg-muted/50 StatCell yerine hairline tanım listesi (DetailFieldGroupsGrid), 1152px gri segment tablist yerine `TabsList variant="line"` (içerik genişliğinde, seçilide 2px alt çizgi), çıplak not satırı kalktı. distinctColors 19 @1440x900.',
    'DetailFieldGroupsGrid + TabsList variant="line" — ortak ui/tabs.tsx değiştirilmeden var olan varyant kullanıldı.');
  patch(r, 'bakim-makine-detay-04', {
    severity: 'P1',
    measure: 'Tur 3: machine-detail.tsx:180+ içinde 3 ayrı ham `<Table>` (planlar / iş emirleri / duruşlar sekmeleri), DataTable kullanımı 0. Sonuç: 390px\'te bu sekmeler DataTable\'ın mobil kart görünümüne dönüşmüyor, `overflow-x-auto` ile yatay kaydırılan masaüstü tablosu olarak kalıyor; sütun başlığı tipografisi ve satır yüksekliği /bakim/planlar (36px) ile eşleşmiyor.',
    target: 'sekme içi listeler DataTable ile (aynı 36px satır, aynı başlık stili, 390px\'te kart görünümü) — ham <Table> sayısı 0',
  });
  add(r, {
    id: 'bakim-makine-detay-07', criterion: 9, severity: 'P0',
    text: "YENİ: 390px'te sayfa içeriği görünüm alanını 206px aşıyor ve taşan kısım ERİŞİLEMİYOR (belge yatay kaymıyor, ata kap kırpıyor). 'Son iş emirleri / Son duruşlar / Bakım planları' ızgarası tek sütunda 580px genişliğe şişiyor; iş emri durum rozeti (bg-success noktası x=511), 'Bakım planları' tarihi '13.09.2026' (x=533-596) ve satır sonu meta bilgisi ekranın dışında kalıyor. Kök neden: `grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3` — mobilde açık `grid-cols-1` yok ve ızgara çocukları `min-width:auto` taşıdığından sütun max-content'e (580px) genişliyor; içerideki `min-w-0 truncate` devreye girmiyor (span 478px genişlikte, kırpılmadan basılıyor).",
    measure: 'Tur 3 @390x844: main.scrollWidth 596 > main.clientWidth 390 (fazlalık 206px); belge kökü scrollWidth 390 = clientWidth 390 → taşan içerik kaydırılamıyor. Görünüm alanı dışında kalan yaprak düğümler: h3 "Son iş emirleri" (right 596), h3 "Son duruşlar" (596), p "Duruş kaydı yok." (596), h3 "Bakım planları" (596), span.bg-success durum noktası (right 517), span "13.09.2026" (right 596), span.min-w-0.truncate iş emri başlığı (right 494).',
    target: 'main.scrollWidth ≤ main.clientWidth (390) @390x844 ve görünüm alanı dışında kalan yaprak düğüm sayısı 0 — özet ızgarasına açık `grid-cols-1` + ızgara çocuklarına `min-w-0`',
    file: 'apps/web/src/modules/maintenance/components/machine-detail.tsx:82 (özet ızgarası)',
    openedRound: 3,
  });
  add(r, {
    id: 'bakim-makine-detay-08', criterion: 5, severity: 'P1',
    text: "YENİ: 1440px masaüstünde 'Son iş emirleri' özetindeki iş emri başlığı, satırdaki rozet + göreli zaman bloğu sabit genişlikte olduğu için 181px'e sıkışıp kelime ortasından kesiliyor ('Haftalık bıçak/hazne temizli…'). 370px'lik sütunun yarısından fazlası rozete gidiyor.",
    measure: 'Tur 3 @1440x900: span.min-w-0.truncate scrollWidth 478 > clientWidth 181 (kırpma 297px); satırın kalan 189px\'i StatusBadge + "10 dakika önce" bloğuna gidiyor',
    target: 'başlık için en az 240px (clientWidth ≥ 240) — göreli zaman lg altında gizlensin ya da başlık ile meta iki satıra ayrılsın; kırpma ≤ 60px',
    file: 'apps/web/src/modules/maintenance/components/machine-detail.tsx:88-97',
    openedRound: 3,
  });
  add(r, {
    id: 'bakim-makine-detay-09', criterion: 7, severity: 'P1',
    text: 'YENİ: Yükleme iskeleti (sekme çubuğu + 8 × h-16 alan kutusu) artık gerçek sayfayı yansıtmıyor — gerçek "Özellikler" sekmesinde hairline alan ızgarası + üç sütunlu özet bloğu + 120px yüksekliğinde OEE sparkline var; ayrıca iskelet hâlâ 8 gri kutu çiziyor, gerçek sayfada gri dolgulu yüzey 0 (bakim-makine-detay-06 düzeltmesinden sonra iskelet güncellenmedi).',
    measure: 'Tur 3: loading.tsx ≈278px (84px başlık + 32px sekme + 138px 8×h-16 ızgara + boşluklar), 8 adet gri dolgulu blok; gerçek sayfa contentBottom 790px @1440x900, gri dolgulu yüzey 0 — 512px sıçrama',
    target: 'iskelet gerçek düzeni yansıtsın (hairline alan ızgarası + 3 sütunlu özet + grafik yer tutucusu); yükseklik farkı ≤ 24px',
    file: 'apps/web/src/app/(app)/bakim/makineler/[id]/loading.tsx',
    openedRound: 3,
  });
  set(r, [5, 5, 5, 5, 4, 5, 4, 5, 2, 5, 4, 5], 'Linear',
    "Tur 3 delta: k1 4→5 (çıplak not satırı kapandı — 'Not' etiketli alan), k3 4→5 (contentBottom 440→790px, emptyBelow 461→111px; özet bloğu + OEE sparkline geldi, '—' alanları varsayılan gizli), k5 4→4 (1152px gri segment sekme çubuğu kapandı ama YENİ: özet satırı başlığı 478→181px kırpılıyor — makine-detay-08), k12 4→5 (gri dolgulu yüzey 9→0). DÜŞÜŞ: k9 5→2 — 390px'te main.scrollWidth 596 > clientWidth 390, taşan 206px ERİŞİLEMİYOR (belge kaymıyor); durum rozeti ve tarihler ekran dışında (makine-detay-07, P0). k7 5→4 (iskelet gerçek düzeni yansıtmıyor, 512px sıçrama), k11=4 (sekme içi 3 ham <Table>, 390px'te kart görünümüne dönüşmüyor). Toplam 54 < 57 VE k9=2 < 4 → KAZANAN: Linear. Yakınsama (§7): k9 (+3), k5 (+1), k7 (+1), k11 (+1) bulguları açık — dördü kapanınca 60 ≥ 57.");
}

/* ---------------------------------------------------------------- /bakim/is-emirleri/yeni */
{
  const r = get('/bakim/is-emirleri/yeni');
  patch(r, 'bakim-yeni-02', {
    measure: 'Tur 3: 1. adım contentBottom 337px, emptyBelow 563px @1440x900 (Tur 2: contentBottom ≈470px, emptyBelow ≈430px — 133px KÖTÜLEŞTİ). Ekranda etkileşimli eleman 4 (tarama input, makine combobox, Vazgeç, Arızayı bildir).',
    target: 'emptyBelow ≤ 200px — masaüstünde yan panelde son bildirilen arızalar/makine listesi ya da akışın tek sayfada toplanması',
  });
  add(r, {
    id: 'bakim-yeni-03', criterion: 11, severity: 'P2',
    text: "YENİ: Sayfa başlığı modülün diğer route'larıyla hizalanmıyor. Form `mx-auto max-w-xl` ile ortalanırken PageHeader de aynı kabın içinde kaldığından 'Arıza Bildir' başlığı sayfa oluğunun 288px sağında başlıyor; /bakim/makineler, /bakim/planlar, /bakim/is-emirleri, /bakim/oee başlıkları 264px'te. Modülde gezerken başlık ekranın ortasına sıçrıyor.",
    measure: 'Tur 3 @1440x900: h1 "Arıza Bildir" left 552px; /bakim/makineler h1 left 264, /bakim/planlar 264, /bakim/is-emirleri 264, /bakim/oee 264 (içerik kabı innerLeft 264). Fark 288px.',
    target: 'h1 left = 264px (diğer bakım route\'larıyla aynı sayfa oluğu) — ortalama yalnızca form gövdesine uygulansın, PageHeader tam genişlikte kalsın',
    file: 'apps/web/src/app/(app)/bakim/is-emirleri/yeni/page.tsx',
    openedRound: 3,
  });
  set(r, [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 4, 5], 'Plantero',
    "Tur 3 delta: k11 5→4 — YENİ bakim-yeni-03: h1 sol kenarı 552px, modülün diğer dört route'unda 264px (288px kayma). k3=4 kalıyor ve ÖLÇÜM KÖTÜLEŞTİ (emptyBelow 430→563px, contentBottom 470→337px) ama kriterin bandı korunuyor: mobil-öncelikli akış, 390px'te kusursuz (kök 390=390, tek kolon, 44px altı gerçek dokunma hedefi 0, tarama input'u 56px). Diğerleri değişmedi. Toplam 58 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.");
}

/* ---------------------------------------------------------------- /bakim/oee */
{
  const r = get('/bakim/oee');
  patch(r, 'bakim-oee-02', { measure: 'Tur 3: contentBottom 639px, emptyBelow 262px @1440x900 — Tur 2 ile birebir aynı' });
  patch(r, 'bakim-oee-03', { measure: 'Tur 3: oee/page.tsx:24-43 — sınıflarda `active:` yok, `data-pressable` yok; globals.css:173-185 basılı ölçek kuralı yalnızca button/[role=button]/a[data-pressable] için geçerli, bu çipler düz `<Link>`' });
  patch(r, 'bakim-oee-04', { measure: 'Tur 3: KpiStripRow kaydırıcısı scrollWidth 792 > clientWidth 358 @390x844; 3. kart (Performans) etiket ortasından kesik, 5 kartın 3\'ü ilk bakışta görünüm alanı dışında. Belge kökünde taşma yok (390 = 390).' });
  set(r, [5, 5, 4, 5, 5, 5, 5, 4, 4, 5, 5, 5], 'Plantero',
    'Tur 3: bu route\'a düzeltme uygulanmadı; üç P2 bulgusu da yeniden ölçüldü, sonuçlar Tur 2 ile aynı. distinctColors 14 @1440x900 / 12 @390x844 (modülün en düşüğü), KPI şeridi 80px + dikey hairline ayraç, rakamlar tabular-nums. k3=4 (emptyBelow 262px), k8=4 (hat çiplerinde basılı durumu yok), k9=4 (mobil KPI şeridinde 3./4./5. kart görünüm alanı dışında). Toplam 57 ≥ 56 (Stripe), hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.');
}

card.round = R;
card.measuredAt = '2026-09-06';
card.note = "Tur 3 — tüm açık bulgular pnpm shot + pnpm measure + scripts/probe-bakim-r3.ts / -r3b / -r3c / -r3d / -r3e / -r3f ile yeniden ölçüldü. DB yeniden seed edildi: makine MK-001 (c362ef28-6a1a-4b51-8155-da47aa0ed935), iş emirleri MO-2026-000006 (230ae50c-…, reported/arıza) ve MO-2026-000003 (3fb0e976-…, periyodik/done). KAZANAN 5/7 route (makineler 57, planlar 59, is-emirleri 57, is-emirleri/yeni 58, oee 57); KAYBEDEN 2 route: /bakim/is-emirleri/[id] (55, k6=3) ve /bakim/makineler/[id] (54, k9=2 — P0 mobil taşma). Detay sayfaları Tur 2→3 arasında yeniden kuruldu (DetailFieldGroupsGrid, olay geçmişi, line-tabs); bu düzeltmeler dokuz bulgu kapattı ama iki yeni kök neden açtı: (1) ham numeric(18,4) dizesinin QtyCell yerine doğrudan basılması, (2) mobilde ızgara sütununun max-content'e şişip erişilemez taşma yaratması. Ortak bileşen kaynaklı konular (KpiCard delta yer tutucusu, KpiStripRow mobil snap-kaydırıcı, DataTable mobil kart iskeleti, primary yeşil ↔ success yeşil ton yakınlığı, PageHeader) kural 5 gereği burada AÇILMADI — shell modülüne aittir.";

writeFileSync(path, JSON.stringify(card, null, 1) + '\n');
const rows = Object.entries(card.routes).map(([k, v]) => `${k.padEnd(30)} ${String(v.total).padStart(3)}/${v.referenceTotal}  ${v.verdict.padEnd(9)} open=${v.open.length} (P0/P1: ${v.open.filter((f) => f.severity !== 'P2').length})`);
console.log(rows.join('\n'));

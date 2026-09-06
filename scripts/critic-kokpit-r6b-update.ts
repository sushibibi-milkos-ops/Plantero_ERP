/**
 * Tur 6 (KRİTİK) kokpit puan kartı güncellemesi — docs/DESIGN-SCORECARD.md kural 1-3.
 *   tsx scripts/critic-kokpit-r6b-update.ts
 * Ölçüm kaynakları: artifacts/critic/measure-kokpit-r6/, artifacts/critic/probe-kokpit-r6/
 * (scripts/probe-kokpit-r3d.ts, probe-kokpit-r4.ts, probe-kokpit-r5.ts, probe-kokpit-r6.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const p = resolve(process.cwd(), 'artifacts/critic/kokpit.json');
const card = JSON.parse(readFileSync(p, 'utf8'));
const R = 6;

card.round = R;
card.note =
  'Tur 6 (kritik doğrulama): 5 rol kesiti yeniden çekildi (scripts/shot-kokpit-r3.ts, 1440x900 + 390x844). ' +
  'Ölçümler: artifacts/critic/measure-kokpit-r6/ (pnpm measure), artifacts/critic/probe-kokpit-r6/*-1440-r3d.json, ' +
  '*-1440.json (r4), *-1440-r5.json (r5), *-1440-r6.json + *-390-r6.json (YENİ scripts/probe-kokpit-r6.ts: çok satırlı ' +
  'satır yüksekliği + alt satır sayısı, boş durum ANATOMİSİ [ikon/başlık/açıklama/eylem], kırpma envanteri, katlama üstü ' +
  'bilgi birimi). ÖRNEKLEME NOTU: koşu Europe/Istanbul 7 Eylül 01:57-03:10 arasında yapıldı — gün dönümü SONRASI durum; ' +
  '"Bugün"/"Bugünün tahsilatları"/"Kritik stok"/"Fire kırılımı" bölümleri boş durumda. Bu, panonun her gün 00:00-ilk ' +
  'işlem arası GERÇEKTEN yaşadığı durumdur ve boş durum anatomisini görünür kılar. ' +
  'DOĞRULANAN TUR 6 KAPANIŞLARI (3): kokpit-admin-col-balance-03 — FlowGrid (CSS çoklu-kolon) İKİ farklı içerik ' +
  'hacminde de dengeliyor: colSpread 72px (Son aktiviteler 8 satır, probe r4) ve 133px (3 satır, probe r3d), hedef ≤200px. ' +
  'kokpit-activity-row-anatomy-01 — "Son aktiviteler" 8/8 satır 40px; ekrandaki TEK satırlık liste satırı yüksekliklerinin ' +
  'distinct kümesi {40} (Banka 40x3, SKT riski 40x5, Geciken alacak 40x4, Son aktiviteler 40x8). ' +
  'kokpit-fin-payments-row-h11-01 — finance-dashboard.tsx:126 artık RowLink (kod doğrulaması; bölüm bu örnekte boş durumda). ' +
  'ORTAK BİLEŞEN (shell.json) DOĞRULAMASI: shell-button-active-state-01 kokpit tarafında KAPALI — `active:` kapsaması ' +
  '34/34 (admin), 16/16 (depo), 28/28 (muhasebe), 21/21 (satış), 20/20 (üretim); shell-qtycell-zero-tone-01 KAPALI — ' +
  'tüm sıfır değerler (0, ₺0, €0,00) oklab(0.552 … /0.7) muted tonda. shell-emptystate-compact-height-01 HÂLÂ AÇIK (P2). ' +
  'YENİ AÇIK BULGULAR (2): (a) kokpit-depo-empty-action-04 — P1, kriter 7: depo "Bugün" boş durumu ikon + TEK satır ' +
  'başlıktan ibaret, açıklama DA eylem DE yok (probe r6: textLines 1, action false), oysa aynı modüldeki diğer üç boş ' +
  'durum (admin "Kritik stok", muhasebe "Bugünün tahsilatları", üretim "Fire kırılımı") ikon+başlık+açıklama+eylem ' +
  'taşıyor. Tur 1-2-3te üç kez (kokpit-empty-action-01/02/03, ikisi P1) aynı kusur için açılıp yalnızca O AN GÖRÜNEN ' +
  'boş durum düzeltilmiş; kaynakta kokpitin 26 `EmptyState` çağrısından 19u hâlâ çıplak `compact title="…"`. ' +
  '(b) kokpit-multiline-row-band-01 — P2, kriter 11/3: çok satırlı liste satırı yüksekliği masaüstünde iki değerde ' +
  '{52.5, 58.5}; modülün kendi belgelediği band (shared.tsx:441-445 "iki/çok satırlık satır ≤56px") 2.5px aşılıyor. ' +
  'KOD DÜZEYİ HAREKET TARAMASI TEMİZ (yeniden koşuldu): modules/kokpit + kokpitin kullandığı ortak bileşenlerde ' +
  '`transition: all`/`transition-all` YOK, curve olarak `ease-in` YOK (yalnızca --ease-in-out token ADI), `scale(0)` YOK, ' +
  '≥300ms süre YOK (140ms transform, 220ms enter-up; reduced-motion 120ms; 800ms yalnızca süregiden spinner istisnası); ' +
  '`hover:` globals.css:9-16te `@media (hover:hover) and (pointer:fine)` ile korunuyor; `:active` scale(0.97) ' +
  'globals.css:176-181de `:not(:focus-visible)` guardıyla klavye aktivasyonundan ayrılmış.';

type Open = Record<string, unknown>;
const setRoute = (key: string, scores: number[], verdict: string, notes: Record<string, string>, open: Open[]) => {
  const r = card.routes[key];
  r.round = R;
  r.scores = scores;
  r.total = scores.reduce((a: number, b: number) => a + b, 0);
  r.verdict = verdict;
  r.scoreNotes = notes;
  r.open = open;
};

// ---------------- /kokpit?rol=admin (Stripe 56) ----------------
setRoute('/kokpit?rol=admin', [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5], 'KAZANAN: Plantero', {
  '1': '5 — h1 24px/600 (mobil 20px/600), bölüm başlığı 13px/600, gövde 13px, etiket 10-12px muted. measure-kokpit-r6/admin-1440.json.',
  '2': '5 — Tur 6 FlowGrid doğrulandı: colSpread 72px (8 satırlık Son aktiviteler) ve 133px (3 satırlık) — İKİ içerik hacminde de ≤200px. Sayfa kenarı 24px, bölüm arası 16px, kart içi px-4.',
  '3': '4 — DEĞİŞMEDİ. Katlama üstünde 5 li satırı + 8 şerit hücresi + 4 KPI; "Kritik stok" boş durumu ilk ekranın 231px’ini yiyor (emptyAboveH 231/900). Yapısal alt ölçütler tam (satır 40px, gövde 13px, mobil kart 60-64.5px) ama ≥15 satır hedefi tutmuyor — kök neden paylaşılan EmptyState compact py-10 (shell-emptystate-compact-height-01, P2).',
  '4': '5 — nötr zemin + tek yeşil vurgu; kırmızı yalnızca negatif tutar/vade aşımı, amber yalnızca SKT uyarısı. Sıfırlar muted.',
  '5': '5 — hairline satır ayracı (divide-border/50), 13px/600 başlık + border-b/60, taşma yok (scrollW 1440 = clientW), sayı sütunu sağ kenar sapması 0px (rowRights 815/815/815, 1399x4).',
  '6': '5 — tüm para/miktar tabular-nums; satırda 2 ondalık, KPI/şeritte yuvarlanmış — kademe kuralı modül genelinde tutarlı; sıfırlar soluk.',
  '7': '5 — "Kritik stok" boş durumu ikon+başlık+açıklama+eylem (probe r6: icon true, textLines 2, action true); iskelet yükleme mevcut.',
  '8': '5 — `active:` kapsaması 34/34; :active scale(0.97) :not(:focus-visible) guardlı; focus ring 2px.',
  '9': '5 — 390px: yatay taşma yok (scrollW 390 = clientW), 44px altı etkileşimli hedef yok (yalnızca tıklanamaz breadcrumb span), tek kolon, kart 60-64.5px (band 56-72).',
  '10': '5 — 16px sidebar ikon seti, bölüm başlıklarında süs ikonu yok, "Tümü →" 12px.',
  '11': '5 — tek satırlık liste satırı yüksekliklerinin distinct kümesi {40} (Tur 6 kapanışı); üç şeridin (Onay kuyruğu / SKT riski / Geciken alacak) hücre anatomisi birebir aynı (15px değer üstte + 10px muted etiket). Çok satırlı satırdaki 6px sapma yeni P2 olarak açıldı, ancak mobilde (390px) o satırlar da tek bantta (60-64.5px) — tek puanlık düşüş için yeterli değil.',
  '12': '5 — kutu içinde kutu yok, gölge yok, çerçeve çorbası yok; rozetler sessiz.',
}, [
  {
    openedRound: 3, id: 'kokpit-fold-rows-01', criterion: 3, severity: 'P2',
    text: 'Katlama üstünde (1440x900) yalnızca 5 li satırı görünüyor. Kalan tek neden "Kritik stok" boş durumunun 277px’lik bölüm yüksekliği (231px’i ilk ekranda) — paylaşılan `EmptyState` compact py-10 sabiti. FlowGrid dengelemesi bu boş durumu sağ kolonun 2. sırasına, yani ilk ekranın tam ortasına yerleştiriyor.',
    measure: '1440x900 /kokpit (admin) Tur 6: liAbove 5, cellAbove 8, emptyAboveH 231/900 (probe-kokpit-r6/admin-1440-r6.json); "Kritik stok" bölüm yüksekliği 277px, boş durum kutusu 231px — Tur 5’e göre DEĞİŞMEDİ.',
    target: 'İlk ekranda ≥15 satır: compact boş durum yüksekliği ≤160px (shared EmptyState) — bu tek başına "Kritik stok"u 277→206px’e indirir ve altındaki "SKT riski" satırlarını katlamanın üstüne taşır.',
    file: 'apps/web/src/components/empty-state.tsx (compact py-10 → shell-emptystate-compact-height-01) + apps/web/src/modules/kokpit/components/gm-dashboard.tsx',
    remeasuredRound: 6,
  },
  {
    openedRound: 6, id: 'kokpit-multiline-row-band-01', criterion: 11, severity: 'P2',
    text: 'Çok satırlı liste satırı masaüstünde İKİ farklı yükseklikte: `ProductionLineRow` ("Üretim hatları" / üretim şefinde "Hat durumu") 52.5px, `TodayRow` ("Bugün") ve üretim kesitindeki "Son iş emirleri" satırı 58.5px. İkisi de aynı görsel sınıf (2 metin satırı + sağa yaslı rozet/meta) ve aynı ekranda yan yana duruyor. Üstelik 3 alt satır taşıyan ProductionLineRow, 2 alt satır taşıyan TodayRow’dan KISA. shared.tsx:441-445 modülün kendi bandını "iki/çok satırlık satır ≤56px" diye belgeliyor; 58.5px bu bandı 2.5px aşıyor. Mobilde (390px) sapma yok — Hat durumu 64.5 / Son iş emirleri 64.5 / Bugün 62.5, hepsi 56-72 bandında.',
    measure: '1440x900 Tur 6 (probe-kokpit-r6/admin-1440-r6.json + uretim_sefi-1440-r6.json): "Üretim hatları" h=[52.5]x3, "Bugün" h=[58.5], "Hat durumu" h=[52.5]x3, "Son iş emirleri" h=[58.5]x8 → çok satırlı satır yüksekliklerinin distinct kümesi {52.5, 58.5}. 390px: {62.5, 64.5} (sapma 2px).',
    target: 'Masaüstünde çok satırlı liste satırı yüksekliklerinin distinct kümesi tek elemanlı ve ≤56px olsun (ör. TodayRow ve iş emri satırının `sm:py-2` dolgusu ProductionLineRow’un `sm:py-1.5` değerine çekilsin). Kabul ölçütü: /kokpit (admin) ve /kokpit (üretim şefi) 1440x900 kesitlerinde çok satırlı satır yüksekliği kümesi = {52.5} (ya da tek bir ≤56px değer).',
    file: 'apps/web/src/modules/kokpit/components/shared.tsx:398-427 (TodayRow, `sm:py-2`) + apps/web/src/modules/kokpit/components/production-chief-dashboard.tsx:110-125 ("Son iş emirleri" satırı) — referans anatomi shared.tsx:456 ProductionLineRow (`sm:py-1.5`)',
    affects: ['/kokpit?rol=admin', '/kokpit?rol=uretim'],
  },
]);

// ---------------- /kokpit?rol=depo (Linear 57) ----------------
setRoute('/kokpit?rol=depo', [5, 5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5], 'KAZANAN: Linear', {
  '1': '5 — değişmedi (h1 24/600, gövde 13px, etiket 10-12px).',
  '2': '5 — değişmedi; kolon dibi farkı 58px (Karantina 529 / SKT riski 587), altındaki "Bugün" tam genişlik şerit.',
  '3': '5 — değişmedi: satır 40px, gövde 13px, mobil kart 63-64.5px. Sayfa 900px içinde tamamlanıyor (pageH 900), 9 li satırının 9’u da katlamanın üstünde — görünen satır sayısı veriyle (9 kayıt) sınırlı, düzenle değil.',
  '4': '5 — değişmedi; amber yalnızca karantina/SKT uyarısı.',
  '5': '5 — değişmedi; rowRights 815x4, taşma yok.',
  '6': '5 — değişmedi; tabular-nums, 2 ondalık, sıfır muted.',
  '7': '5→4 — YENİ P1 kokpit-depo-empty-action-04: "Bugün" boş durumu yalnızca ikon + tek satır başlık (probe r6: icon true, textLines 1, action false). Kriter 7 tanımı açıkça "ikon+metin+eylem" istiyor; modüldeki diğer üç boş durum bunu sağlıyor. İskelet yükleme mevcut olduğu için 3’e değil 4’e iniyor.',
  '8': '5 — `active:` kapsaması 16/16.',
  '9': '5 — 390px taşma yok, 44px altı etkileşimli hedef yok, kart 63-64.5px.',
  '10': '5 — değişmedi.',
  '11': '5 — tek satırlık satırlar {40}, şerit anatomisi tek.',
  '12': '5 — değişmedi.',
}, [
  {
    openedRound: 6, id: 'kokpit-depo-empty-action-04', criterion: 7, severity: 'P1',
    text: 'Depo panosunun tam genişlikteki "Bugün" bölümü boş durumda 190px’lik kartı yalnızca ikon + "Bugün henüz mal kabul/sevkiyat yok" başlığı için harcıyor — açıklama DA eylem DE yok. Aynı modüldeki diğer üç boş durum (admin "Kritik stok", muhasebe "Bugünün tahsilatları", üretim "Fire kırılımı") ikon+başlık+açıklama+eylem taşıyor: aynı bilgi sınıfı, iki farklı özen seviyesi. Bu kusur Tur 1/2/3’te üç kez açıldı (kokpit-empty-action-01 P2, -02 P1, -03 P1) ve her seferinde YALNIZCA o an ekranda görünen boş durum düzeltildi; kaynakta kokpitin 26 `EmptyState` çağrısından 19’u hâlâ çıplak `compact title="…"` (depo-dashboard.tsx:37,76,99 · finance-dashboard.tsx:44,52,73,92 · gm-dashboard.tsx:60(yalnızca description),97,114,146,192,218 · maintenance-dashboard.tsx:21 · production-chief-dashboard.tsx:37,86,108 · quality-dashboard.tsx:21(yalnızca description),39 · sales-dashboard.tsx:46,56,79,112). Depo kesitinde gün dönümü sonrası GÖRÜNÜR hale geldi; diğerleri veri boşaldığında aynı şekilde görünür.',
    measure: '1440x900 ve 390x844 /kokpit (depo) Tur 6: "Bugün" boş durumu icon=true, textLines=1, action=FALSE, kutu 144px / bölüm 190px (artifacts/critic/probe-kokpit-r6/depo-1440-r6.json, depo-390-r6.json). Karşılaştırma: admin "Kritik stok" textLines=2/action=true, muhasebe "Bugünün tahsilatları" textLines=2/action=true, üretim "Fire kırılımı" textLines=2/action=true.',
    target: 'Kokpit modülündeki HER `EmptyState` çağrısı `description` + `action` taşısın (tek seferde, o an görünen tek örnek değil). Kabul ölçütü: `grep -c "EmptyState compact title=" apps/web/src/modules/kokpit/components/*.tsx` = 0 VE beş rol kesitinde render olan her boş durumda probe-kokpit-r6 `textLines ≥ 2` ve `action === true`. Depo "Bugün" için önerilen eylem: "Mal kabul oluştur" → /depo/mal-kabul/yeni.',
    file: 'apps/web/src/modules/kokpit/components/depo-dashboard.tsx:99 (ve aynı desenin 18 kopyası: depo-dashboard.tsx:37,76 · finance-dashboard.tsx:44,52,73,92 · gm-dashboard.tsx:97,114,146,192,218 · maintenance-dashboard.tsx:21 · production-chief-dashboard.tsx:37,86,108 · quality-dashboard.tsx:39 · sales-dashboard.tsx:46,56,79,112)',
  },
]);

// ---------------- /kokpit?rol=muhasebe (Stripe 56) ----------------
setRoute('/kokpit?rol=muhasebe', [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5], 'KAZANAN: Plantero', {
  '1': '5 — değişmedi.',
  '2': '5 — kolon dibi farkı 138px (999 / 1137), hedef ≤200px.',
  '3': '4 — DEĞİŞMEDİ: liAbove 13 (hedef ≥15). "Bugünün tahsilatları" boş durumu ilk ekranın 212px’ini yiyor. Kök neden paylaşılan EmptyState compact py-10.',
  '4': '5 — kırmızı yalnızca negatif bakiye/gecikme; sıfırlar muted.',
  '5': '5 — satır 40px x15, rowRights sapması 0, taşma yok.',
  '6': '5 — tabular-nums; satırda 2 ondalık, şeritte yuvarlanmış — kademe tutarlı.',
  '7': '5 — "Bugünün tahsilatları" boş durumu ikon+başlık+açıklama+eylem (Tahsilat kaydet).',
  '8': '5 — `active:` kapsaması 28/28.',
  '9': '5 — 390px taşma yok, kart 63px, 44px altı etkileşimli hedef yok.',
  '10': '5 — değişmedi.',
  '11': '5 — tek satırlık satırlar {40} (Banka 3, Mutabakat 8, Geciken 4). "Nakit projeksiyonu" hücresinin üstte ay etiketi taşıması AYRI bir anatomi değil, `StatStrip`in belgelenmiş `top?` varyantı (shared.tsx:156-164) — aynı bileşen, aynı 15px değer/10px etiket dili; puan düşürülmedi.',
  '12': '5 — değişmedi.',
}, [
  {
    openedRound: 4, id: 'kokpit-fin-fold-rows-01', criterion: 3, severity: 'P2',
    text: 'Katlama üstünde 13 li satırı var, hedef ≥15. Tek kalan neden "Bugünün tahsilatları" boş durumunun 258px’lik bölüm yüksekliği (212px’i ilk ekranda).',
    measure: '1440x900 /kokpit (muhasebe) Tur 6: liAbove 13, cellAbove 11, emptyAboveH 212/900 (probe-kokpit-r6/muhasebe-1440-r6.json). Satırlar 40px (Tur 5’te kapanan RowLink düzeltmesi korunuyor). Tur 5: 13 — DEĞİŞMEDİ.',
    target: 'foldRows ≥ 15: compact boş durum yüksekliği ≤160px (258→160px, ~98px kazanç = katlamanın altındaki 2 satır yukarı gelir).',
    file: 'apps/web/src/components/empty-state.tsx (compact py-10 → shell-emptystate-compact-height-01) + apps/web/src/modules/kokpit/components/finance-dashboard.tsx:103',
    remeasuredRound: 6,
  },
]);

// ---------------- /kokpit?rol=satis (Stripe 56) ----------------
setRoute('/kokpit?rol=satis', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 'KAZANAN: Plantero', {
  '1': '5 — değişmedi.',
  '2': '5 — iki kolonlu üst sıranın dip farkı 78px (448 / 526); altındaki "Son siparişler" tam genişlik.',
  '3': '5 — liAbove 17 (≥15 hedefi TUTUYOR), satır 40px, gövde 13px, mobil kart 62.5-63px.',
  '4': '5 — yeşil yalnızca huni çubuğu (vurgu) ve "Faturalandı" (başarı); diğer durumlar nötr gri.',
  '5': '5 — "Son siparişler" 10 satır, rowRights 1259x10 (sapma 0), rozetler sabit sağ yuvada, taşma yok.',
  '6': '5 — tabular-nums, 2 ondalık, birim (KG/ADET) 10px muted ve sayıdan sonra.',
  '7': '5 — bu kesitte boş durum render olmuyor; iskelet yükleme mevcut. (Kaynakta 4 çıplak EmptyState var — kokpit-depo-empty-action-04’ün kapsamına dahil.)',
  '8': '5 — `active:` kapsaması 21/21.',
  '9': '5 — 390px taşma yok, kart 62.5-63px, 44px altı etkileşimli hedef yok. Tek kırpma KPI başlığında (aşağıdaki P2).',
  '10': '5 — değişmedi.',
  '11': '5 — değişmedi.',
  '12': '5 — değişmedi.',
}, [
  {
    openedRound: 5, id: 'kokpit-satis-kpi-title-trunc-01', criterion: 9, severity: 'P2',
    text: '390px’te "Bugünkü ciro (brüt = net)" KPI başlığı ellipsis’le kırpılıyor ("Bugünkü ciro (brüt …"). Ölçü birimi okunuyor ama parantez içi açıklama kayboluyor.',
    measure: '390x844 /kokpit (satış) Tur 6: KPI başlığı clientW 126 / scrollW 144 (18px eksik) — Tur 5 ile AYNI, değişmedi (probe-kokpit-r6/satis-390-r6.json clipped[0]).',
    target: '390px’te KPI başlığı kırpılmasın: scrollW ≤ clientW (başlık 2 satıra sarsın ya da mobil kart genişliği 140→160px).',
    file: 'apps/web/src/components/kpi-strip.tsx (mobil kart sabit genişlik) + apps/web/src/modules/kokpit/components/sales-dashboard.tsx (KpiCard title)',
    remeasuredRound: 6,
  },
]);

// ---------------- /kokpit?rol=uretim (Linear 57) ----------------
setRoute('/kokpit?rol=uretim', [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5], 'KAZANAN: Plantero', {
  '1': '5 — değişmedi.',
  '2': '5 — kolon dibi farkı 182px (979 / 797), hedef ≤200px — sınıra en yakın kesit, ama içinde.',
  '3': '4 — DEĞİŞMEDİ: liAbove 14, hedefe (≥15) 1 satır kaldı. "Fire kırılımı (7 gün)" boş durumu ilk ekranın 212px’ini yiyor.',
  '4': '5 — gri/yeşil/mavi/amber dört durum tonu + kırmızı yok; ≤4 ton kuralı içinde.',
  '5': '5 — satır ayracı hairline, miktar sütunu sağ hizalı, taşma yok (scrollW 1440 = clientW).',
  '6': '5 — miktarlar tabular-nums, birim 10px muted, sıfır ("0 ADET") MoneyCell ile aynı soluk tonda.',
  '7': '5 — "Fire kırılımı" boş durumu ikon+başlık+açıklama+eylem ("İş emirlerini gör").',
  '8': '5 — `active:` kapsaması 20/20.',
  '9': '5 — 390px taşma yok, kart 64.5px, 44px altı etkileşimli hedef yok; kırpmalar yalnızca ikincil meta (hat adı, WO·ürün) ve ellipsis’li.',
  '10': '5 — değişmedi.',
  '11': '5 — "Hat durumu" ve "Son iş emirleri" arasındaki 6px çok satırlı sapma P2 olarak açıldı (kokpit-multiline-row-band-01, admin kaydında); mobilde iki liste de 64.5px — tek puanlık düşüş için yeterli değil.',
  '12': '5 — değişmedi.',
}, [
  {
    openedRound: 4, id: 'kokpit-uretim-fold-rows-02', criterion: 3, severity: 'P2',
    text: 'Katlama üstünde 14 li satırı var, hedef ≥15 — 1 satır kaldı. Tek kalan neden "Fire kırılımı (7 gün)" boş durumunun 258px’lik bölüm yüksekliği (212px’i ilk ekranda).',
    measure: '1440x900 /kokpit (üretim şefi) Tur 6: liAbove 14, emptyAboveH 212/900 (probe-kokpit-r6/uretim_sefi-1440-r6.json). Tur 5: 14 — DEĞİŞMEDİ.',
    target: 'foldRows ≥ 15: compact boş durum yüksekliği ≤160px (258→160px). Ek olarak kokpit-multiline-row-band-01 kapanırsa "Son iş emirleri" 8 satır 8x6=48px kısalır ve bu tek başına da 15. satırı katlamanın üstüne taşır.',
    file: 'apps/web/src/components/empty-state.tsx (shell-emptystate-compact-height-01) + apps/web/src/modules/kokpit/components/production-chief-dashboard.tsx:53',
    remeasuredRound: 6,
  },
]);

// yeni kapanışların `closed` kayıtları zaten Tur 6 builder tarafından yazıldı; kritik yalnızca doğruladı.
for (const key of ['/kokpit?rol=admin', '/kokpit?rol=muhasebe']) {
  for (const c of card.routes[key].closed ?? []) {
    if (c.closedRound === 6) c.criticVerifiedRound = 6;
  }
}

writeFileSync(p, JSON.stringify(card, null, 1) + '\n', 'utf8');
console.log('kokpit.json güncellendi (Tur 6, kritik).');
for (const [k, v] of Object.entries(card.routes) as Array<[string, any]>) {
  console.log(`${k}  total=${v.total} (ref ${v.referenceTotal})  min=${Math.min(...v.scores)}  open=${(v.open ?? []).map((o: any) => o.id + '/' + o.severity).join(', ') || '-'}  ${v.verdict}`);
}

/** Tur 11 ihracat puan kartı güncellemesi. */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'artifacts/critic/ihracat.json';
const c: any = JSON.parse(readFileSync(P, 'utf8'));
c.round = 11;
c.note = [
 'Tur 11. Tur 10 kartından (commit c444062) bu yana ihracat modülünde VE ortak bileşenlerde tek satır kaynak değişikliği yok — git diff c444062..HEAD -- apps/web/src/modules/export, apps/web/src/app/(app)/ihracat, apps/web/src/components, apps/web/src/app/globals.css, packages/db/src/seed/export.ts = boş (aradaki değişiklikler kokpit/bakım/ar-ge/core/db-checks dosyalarında).',
 '6 rota × (1440x900 + 390x844) yeniden çekildi, detay sayfasının 4 sekmesi × 2 viewport + kapalı/taslak sevkiyat özet+belgeler + liste 1024x768 + kurlar koyu tema alındı; hepsi Read ile incelendi.',
 'Ölçüm: measure-ihracat-r11/ (12 dosya), probe-ihracat-r11.json (sütun genişliği/dolu/distinct + hover), r11b (gerçek klavye Tab, tabular-nums yaprak, boş arama, mobil dokunma hedefleri — DETAY ROTASI DAHİL, Tur 10 bunu ölçmemişti), r11c/r11d/r11e (odak halkası), r11f (Bağlı irsaliye bağlantısı 390px dokunma hedefi).',
 'Tur 10\'un 4 açık P2 bulgusu yeniden ölçüldü, HEPSİ AÇIK: export_documents due_date 0/30 + responsible_id 0/30 (detay-20, belgeler-04); export_packages net/gross = 0.0000 (detay-21); exchange_rates kaynak sütunu ekranda 25/25 "TCMB" (kurlar-13). Kök neden packages/db/src/seed/export.ts, dokunulmadı.',
 'YENİ P1: ihracat-detay-22 — 390px\'te "Bağlı irsaliye" kartındaki DN bağlantısı 109x20 px (yükseklik 20 < 44) ve dokunmatik cihazda hiçbir bağlantı işareti taşımıyor (renk = gövde metni, alt çizgi yalnız hover ile, hover globals.css:10 ile (hover:hover) altında kapalı). Tur 10 detay rotasını 390px dokunma hedefi için hiç ölçmemişti; bu regresyon değil, yeni ölçüm.',
 'ODAK HALKASI YANLIŞ ALARMI KAYDA GEÇİYOR: Tab sonrası bekleme olmadan okunan getComputedStyle, :focus-visible eşleşse bile --tw-ring-shadow\'u saydam gösteriyor (stil yeniden hesabı yarışıyor). 250ms bekleyip hem stil hem kırpılmış görüntü alındığında 6/6 elemanda halka görünür: buton/kart tetikleyicilerinde border-ring = oklch(0.55 0.16 152) + 3px ring, inputta yeşil kenarlık + halka (artifacts/critic/ihracat-r11-focus-*.png). Kriter 8 düşmedi.',
 'Kod taraması TEMİZ: modül dosyalarında transition-all / transition: all / ease-in / scale(0) / ≥300ms süre / origin-* yok; tek animasyon fetch-rates-button.tsx animate-spin. 5 hover: kullanımının 5\'i de globals.css:10 @custom-variant hover ile (hover:hover) and (pointer:fine) altında.',
 'Koyu tema (kurlar) doğrulandı: mor/mavi çizgi grafiği, kırmızı/yeşil delta ve hairline ayraçlar okunur. 1024x768\'de liste tablosu kendi overflow-x kapsayıcısında kayıyor, sayfa taşması yok.',
].join(' ');
c.measurements = {
  tool: 'pnpm measure + scripts/probe-ihracat-r11{,b,c,d,e,f}.ts',
  files: [
    'artifacts/critic/measure-ihracat-r11/{sevkiyatlar,belgeler,kurlar,gtip,yeni,detay}-{1440,390}.json',
    'artifacts/critic/probe-ihracat-r11.json',
    'artifacts/critic/probe-ihracat-r11b.json',
    'artifacts/critic/probe-ihracat-r11e.json',
    'artifacts/critic/probe-ihracat-r11f.json',
  ],
  ozet: {
    satirYuksekligi1440: 'sevkiyatlar 36 · belgeler 36 · kurlar 36 · gtip 36.5–37 · detay 36 (hedef 36–40 ✓)',
    mobilKartYuksekligi: 'sevkiyatlar 64 · belgeler 60 · gtip 60 · kurlar 64 · detay 64 (hedef 56–72 ✓)',
    tasma: '6 rota × 2 viewport: scrollWidth = clientWidth (1440/390), overflowX=false',
    dokunmaHedefi390: 'sevkiyatlar/belgeler/kurlar/gtip/yeni: 0 ihlal · detay: 1 ihlal (a.font-mono "DN-2026-000028" 109×20)',
    fontKademesi1440: '24 (h1/600) / 13 (gövde) / 12–11 (etiket) — 3 kademe',
    farkliRenk: 'sevkiyatlar 22 · detay 22 · belgeler 20 · kurlar 15 · gtip 15 · yeni 13',
    odakHalkasi: 'gerçek Tab + 250ms: border oklch(0.55 0.16 152) + 3px ring; 6/6 elemanda görünür',
    tabularNums: 'para/kur/miktar hücrelerinin tamamı mono ya da tabular-nums; yalnız tarih sütunları Inter',
    sutunBilgiYogunlugu: 'kurlar Kaynak distinct=1/25 (185px) · detay Belgeler Vade dolu 0/8, Belge no 1/8 · detay Çeki listesi Net kg/Brüt kg dolu 0/1 · belgeler KPI [30,13,0,13]',
  },
};
const R = c.routes;
// 1) sevkiyatlar — değişiklik yok
R['/ihracat/sevkiyatlar'].round = 11;
R['/ihracat/sevkiyatlar'].scoreNotes = 'Tur 10→11: delta YOK. Gerekçe: kaynak değişmedi (git diff c444062..HEAD boş) ve ölçümler birebir aynı: satır 36px/13px, tablo 1152 = kapsayıcı 1152, 10 sütunun 8\'i ≥2 farklı değer, para sütunları sağ hizalı ve mono, hover oklab(0.955 …/0.5) yalnız tıklanabilir satırlarda, 390\'da 3 kart × 64px ve 0 dokunma hedefi ihlali, KPI şeridi 4 blok dikey hairline ayraçla. 60/57 → KAZANAN: Plantero.';
// 2) detay — kriter 9 düşüşü + yeni P1
const d = R['/ihracat/sevkiyatlar/[id]'];
d.round = 11;
d.probeId = 'e7c470c7-ef19-4c11-ace0-5a77377b84b7 (EXP-2026-000002, gümrükte) + 150d33db-63e4-4ae8-8b9b-92db2ca818a1 (EXP-2026-000001, kapalı) + 0eb2515b-bf8e-4af4-b081-5f82f4a0397e (taslak)';
d.scores = [5,5,4,5,5,5,5,5,4,5,5,5];
d.total = 58;
d.scoreNotes = 'Tur 10→11: kriter 9 (mobil düzen) 5→4. Gerekçe: Tur 10 detay rotasını 390px dokunma hedefi için HİÇ ölçmemişti (probe-ihracat-r10b yalnız 4 liste rotasını taradı). Tur 11\'de ölçüldü: "Bağlı irsaliye" kartındaki tek çıkış bağlantısı 109×20 px (yükseklik 20 < 44) ve dokunmatikte bağlantı işareti taşımıyor → ihracat-detay-22 (P1). Kriter 3 KASITLI olarak 4\'te kalıyor: Belgeler sekmesinde Vade 0/8 + Belge no 1/8 (436px/1152 = %37,8) ve Çeki listesinde Net kg/Brüt kg 0/1 (220px = %19,1). Diğer 10 kriter 5: belge zinciri düğümleri kendi para biriminde, "Devam belgesi yok" kesikli yer tutucusu, taslak/kapalı durumda eylem şeridi ve alan etiketleri değişiyor, "Henüz bağlı fatura yok" boş durumu ikon+başlık+açıklama ile, kur ₺37,2000 × €16.800 = ₺624.960,00 /ihracat/kurlar ile birebir, 1440 ve 390\'da sayfa taşması yok. 58/57 ama açık P1 var → KAZANAN: Linear.';
d.open.push({
  id: 'ihracat-detay-22',
  criterion: 9,
  criterionAlso: [8],
  severity: 'P1',
  text: 'Sevkiyat detayının en altındaki "Bağlı irsaliye" kartında, sevkiyatı kaynak irsaliyesine bağlayan TEK bağlantı (DN-2026-000028 → /depo/sevkiyat/<id>) 390px\'te 109×20 px: yükseklik 20px, dikey dolgu 0, min-height yok. Ayrıca dokunmatik cihazda bağlantı olduğuna dair hiçbir işaret yok — rengi gövde metniyle aynı, tek işaret `hover:underline` ve `hover:` globals.css:10\'daki @custom-variant ile (hover:hover) and (pointer:fine) altında olduğu için dokunmatikte hiç tetiklenmiyor. Aynı kartın sağındaki StatusBadge ile birlikte satır zaten 324px genişliğinde; satırın tamamı hedef yapılmalı.',
  measure: '390×844, probe-ihracat-r11f.json: a.font-mono boundingBox w=109 h=20 (EXP-2026-000002 ve EXP-2026-000001\'de aynı), paddingTop/Bottom 0px, minHeight auto, parentH 20. probe-ihracat-r11b.json mobileTouch.detay = tek ihlal. Görsel: artifacts/critic/ihracat-r11-dnlink-EXP-2026-000002.png (bağlantı, düz metinden ayırt edilemiyor).',
  target: '390px\'te bu bağlantının dokunma hedefi ≥44×44 px olsun ve dokunmatikte bağlantı olduğu görünsün. Önerilen: `<Link>`i satırın tamamına genişlet — `flex min-h-11 items-center justify-between -mx-1 px-1 rounded-md` — ve doküman numarasını `text-primary` (ya da kalıcı `underline-offset-2 decoration-border`) ile işaretle; rozet Link\'in içinde kalsın. Kabul ölçütü: probe-ihracat-r11f.ts ile h ≥ 44 ve probe-ihracat-r11b.ts mobileTouch.detay = [] (0 ihlal); 1440px görünüm bozulmasın (satır yüksekliği ≤ 44px kalabilir, masaüstünde min-h yalnız mobilde uygulanacaksa `sm:min-h-0`).',
  file: 'apps/web/src/app/(app)/ihracat/sevkiyatlar/[id]/page.tsx:234-241',
  openedRound: 11,
});
// 3) yeni / belgeler / kurlar / gtip — delta yok
for (const [k, note] of [
  ['/ihracat/sevkiyatlar/yeni', 'Tur 10→11: delta YOK. Kaynak değişmedi; yeniden ölçüldü: 1440 ve 390\'da taşma yok, 13/12 farklı renk, 3 font kademesi, tek kolon form (390), gerçek Tab ile 6/6 alanda yeşil kenarlık + 3px halka, 390\'da görünür 44px altı etkileşimli hedef yok (3 adet 1×1 SELECT shadcn\'in gizli yerli elemanı). 60/57 → KAZANAN: Plantero.'],
  ['/ihracat/belgeler', 'Tur 10→11: delta YOK. Yeniden ölçüldü: 30 satır × 36px, tablo 1152 = kapsayıcı 1152, 5 sütunun 4\'ü veri (Eylemler hover menüsü), Durum 5 farklı değer, 390\'da 30 kart × 60px ve 0 dokunma ihlali, boş arama "Eşleşen kayıt yok" + ikon + öneri. Açık P2 (belgeler-04) kriter 3\'e bağlı ama Tur 8-10 boyunca 5 verildi; gerekçesiz düşüş protokol ihlali olacağı için 5 korunuyor. 60/57 → KAZANAN: Plantero.'],
  ['/ihracat/kurlar', 'Tur 10→11: delta YOK. Yeniden ölçüldü: 25 satır × 36px, 6 sütun, Alış/Satış 23 farklı değer, delta yeşil/kırmızı yalnız işaret için, KPI iki blok dikey hairline ayraçla ve alt satırda alış kuru, grafik ince çizgi + eksen 4 kademe, 390\'da 0 dokunma ihlali, koyu temada grafik/delta/hairline okunur (ihracat-r11-kurlar-dark.png). 60/56 → KAZANAN: Plantero.'],
  ['/ihracat/gtip', 'Tur 10→11: delta YOK. Yeniden ölçüldü: 39 satır × 36,5–37px, 4 sütunun 4\'ü ≥2 farklı değer (Tip 2, GTİP 2), tablo 1152 = kapsayıcı, 15 farklı renk, GTİP kod kartları 4\'lü şeritte birim rozetiyle, 390\'da 39 kart × 60px ve 0 dokunma ihlali. 60/57 → KAZANAN: Plantero.'],
] as Array<[string,string]>) { R[k].round = 11; R[k].scoreNotes = note; }
// açık bulgulara yeniden ölçüm notu
const recheck = (rk: string, id: string, m: string) => {
  const f = R[rk].open.find((x: any) => x.id === id);
  if (f) f.recheck = { ...(f.recheck ?? {}), round11: m };
};
recheck('/ihracat/sevkiyatlar/[id]', 'ihracat-detay-20', 'AÇIK. probe-ihracat-r11.json detay:Belgeler → Vade width=155 rows=8 filled=0 distinct=1; Belge no width=281 filled=1. psql: select count(due_date)=0, count(responsible_id)=0 from export_documents (n=30).');
recheck('/ihracat/sevkiyatlar/[id]', 'ihracat-detay-21', 'AÇIK. probe-ihracat-r11.json detay:Çeki listesi → Net kg width=110 filled=0; Brüt kg width=110 filled=0. psql: export_packages.net_weight_kg/gross_weight_kg = 0.0000 (2/2 satır), export_shipments net/gross = 0.0000.');
recheck('/ihracat/belgeler', 'ihracat-belgeler-04', 'AÇIK. 1440 KPI değerleri [30, 13, 0, 13] — "Vadesi geçmiş" 0, "Sorumlusuz" = "Bekleyen" = 13. psql: count(due_date)=0, count(responsible_id)=0.');
recheck('/ihracat/kurlar', 'ihracat-kurlar-13', 'AÇIK. probe-ihracat-r11.json kurlar cols → Kaynak width=185 rows=25 filled=25 distinct=1 ("TCMB"). psql: exchange_rates.source = TCMB-SEED 172 / TCMB 8 (iki değer, ekranda tek etiket).');
writeFileSync(P, JSON.stringify(c, null, 1));
console.error('ok');

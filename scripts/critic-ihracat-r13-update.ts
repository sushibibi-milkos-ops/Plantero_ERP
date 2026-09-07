/** Tur 13 ihracat kritik kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'artifacts/critic/ihracat.json';
const card = JSON.parse(readFileSync(P, 'utf8'));
const R = 13;

card.round = R;
card.measuredAt = new Date().toISOString();
card.shipmentIdUsed =
  '47587da6-f20a-45cb-aabf-4627f8eb4156 (EXP-2026-000002, gümrükte) · ba3026f7-dffb-4bc7-947b-51f9fb57f88e (EXP-2026-000001, kapalı, faturalı) · b9497774-629a-4e25-8a84-3f14b0a0707a (EXP-2026-000003, taslak) — veritabanı yeniden tohumlandı, Tur 11/12 kimlikleri geçersiz';
card.note =
  'Tur 13. Tur 12 kartından (commit 012cdf7) bu yana ihracat modülünde tek satır değişiklik yok; ortak bileşenlerde YALNIZCA apps/web/src/components/data-table/mobile-cards.tsx (+17/-1, 27f3d9a — mobil kart aksiyon oluğu yer tutucusu). İhracat mobil kartlarında regresyon yok: sevkiyatlar 64px, belgeler 60px, gtip 60px, kurlar 64px, detay 64px; 390px yatay taşma yok. ' +
  '6 rota × (1440x900 + 390x844) + detay 4 sekme × 2 viewport + kapalı/taslak özet + belgeler + liste 1024x768 + koyu tema (kurlar, detay) yeniden çekildi ve Read ile incelendi. ' +
  'Ölçüm: measure-ihracat-r13/ (13 dosya), probe-ihracat-r13.json (sütun genişliği/dolu/distinct + satır hover), r13b (gerçek Tab, boş arama, 390px dokunma hedefi — 6 rotada 0 ihlal), r13c (odak halkası 250ms bekleyerek + kırpılmış görüntü: 18/18 elemanda :focus-visible true, buton/kartta yeşil kenarlık oklch(0.55 0.16 152) + halka), r13d (kapalı sevkiyatın Fatura & kur sekmesindeki bağlantılar). ' +
  'YENİ P1 (ihracat-detay-23): Tur 11 P1 ihracat-detay-22 için yapılan düzeltme İKİZ bağlantıya uygulanmamış. Aynı dosyada (sevkiyatlar/[id]/page.tsx) satır 246 "Bağlı irsaliye" bağlantısı min-h-11 + text-primary + underline ile düzeltilmişken, satır 162 "İhracat faturası" kartındaki fatura bağlantısı hâlâ 137×19,5px (390px), rengi gövde metniyle BİREBİR aynı (oklch(0.21 0.006 285.9)), text-decoration:none ve tek işareti hover:underline — globals.css:10 @custom-variant hover (hover:hover) and (pointer:fine) altında olduğundan dokunmatikte hiç tetiklenmiyor. Tur 11/12 probları EXP-2026-000002 (faturasız) üzerinde ölçtüğü için bu bağlantı hiç render edilmemiş; kapalı+faturalı EXP-2026-000001 ile ölçüldüğünde ortaya çıktı. Aynı sayfada iki belge bağlantısının farklı görünmesi kriter 11i de düşürüyor. ' +
  'Tur 12 açık P2 ihracat-kurlar-13 YENİDEN ÖLÇÜLDÜ, AÇIK: Kaynak sütunu 185px, 25/25 satırda "TCMB", distinct=1. ' +
  'ihracat-detay-22 (Tur 11 P1) KAPALI DOĞRULANDI: "Bağlı irsaliye" bağlantısı 1440px 1126×44, 390px 332×44; iç span text-primary + underline. ' +
  'Kod taraması TEMİZ: modül dosyalarında transition-all / transition: all / ease-in / scale(0) / ≥300ms süre / origin-* yok; tek animasyon fetch-rates-button.tsx animate-spin. 8 hover: kullanımının hepsi globals.css:10 gated variant üzerinden. ' +
  'NOT (bulgu değil): /ihracat/belgeler "Müşteri" sütunu 342px, 30/30 satırda "BioGrün Handels GmbH" (distinct=1) ve /ihracat/sevkiyatlar "Müşteri" (3/3) + "Oluşturma" (3/3) da distinct=1. Bunlar VERİ inceliği (tohumda tek ihracat müşterisi, tek gün) — mimari kısıt değil; ihracat-kurlar-13 ise eşleme yüzünden yapısal olarak ASLA farklılaşamaz, o yüzden yalnızca o açık. Aynı gerekçeyle /ihracat/sevkiyatlar 3 satırla ilk ekranda ≥15 satır ölçütünü karşılamıyor; tablo anatomisi (36px satır, 13px) doğru, eksik olan tohum verisi. ' +
  'Satır hover: yalnızca tıklanabilir tablolarda (sevkiyatlar) arka plan değişiyor (oklab 0.955/0.5); belgeler/kurlar/gtip satırlarında bg değişmiyor — data-table.tsx:256 `clickable &&` koşulu, Tur 11 ve 12 ölçümleriyle birebir aynı, bilinçli ve belgelenmiş tercih (aksiyonlu satırlarda "…" menüsü hover ile beliriyor). Gerekçesiz puan düşürülmedi.';

card.measurements = {
  tool: 'pnpm measure + scripts/probe-ihracat-r13{,b,c,d}.ts',
  files: [
    'artifacts/critic/measure-ihracat-r13/{sevkiyatlar,belgeler,kurlar,gtip,yeni,detay}-{1440,390}.json + sevkiyatlar-1024.json',
    'artifacts/critic/probe-ihracat-r13.json',
    'artifacts/critic/probe-ihracat-r13b.json',
    'artifacts/critic/probe-ihracat-r13c.json',
    'artifacts/critic/probe-ihracat-r13d.json',
  ],
  ozet: {
    satirYuksekligi1440: 'sevkiyatlar 36 · belgeler 36 · kurlar 36 · gtip 36,5–37 · detay 36 (hedef 36–40 ✓)',
    mobilKartYuksekligi: 'sevkiyatlar 64 · belgeler 60 · gtip 60 · kurlar 64 · detay 64 (hedef 56–72 ✓)',
    tasma: '6 rota × 1440/1024/390: scrollWidth = clientWidth, overflowX=false',
    dokunmaHedefi390: '6 rota × main içi a/button/input/tab: 0 ihlal — ANCAK kapalı sevkiyatın Fatura & kur sekmesi (probe r13d): a[href^="/muhasebe/faturalar/"] 137×19,5 (İHLAL, ihracat-detay-23)',
    fontKademesi1440: '24 (h1/600) / 13 (gövde) / 12–11 (etiket) — 3 kademe',
    farkliRenk: 'sevkiyatlar 22 · detay 22 · belgeler 20 · kurlar 15 · gtip 15 · yeni 13',
    odakHalkasi: 'gerçek Tab + 250ms: 18/18 elemanda :focus-visible true; buton/kart tetikleyicilerinde border oklch(0.55 0.16 152) + halka (ihracat-r13-focus-*.png)',
    satirHover: 'sevkiyatlar oklab(0.955 …/0.5) · belgeler/kurlar/gtip rgba(0,0,0,0) (clickable değil — Tur 11/12 ile aynı)',
    sutunBilgiYogunlugu: 'kurlar Kaynak distinct=1/25 (185px, AÇIK P2) · belgeler Müşteri distinct=1/30 (342px, veri inceliği) · detay Belgeler Vade 7/8 dolu, Belge no 1/8 · detay Çeki listesi Net/Brüt kg dolu 1/1 (41,2 / 43,26)',
    bosDurum: '4 liste rotasında arama sonucu yok → ikon + "Eşleşen kayıt yok" + "Arama ya da filtreleri değiştirmeyi deneyin." + arama kutusunda temizle (×) düğmesi',
  },
};

const routes = card.routes as Record<string, any>;
const setRoute = (k: string, scores: number[], notes: string) => {
  routes[k].round = R;
  routes[k].scores = scores;
  routes[k].total = scores.reduce((a: number, b: number) => a + b, 0);
  routes[k].scoreNotes = notes;
};

const ALL5 = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
setRoute('/ihracat/sevkiyatlar', ALL5, 'Tur 12 ile aynı (60). Kaynak değişmedi; tüm ölçümler tekrarlandı ve eşleşti. Kriter 3 için not: tohumda 3 sevkiyat olduğundan "ilk ekranda ≥15 satır" ölçütü veri nedeniyle karşılanmıyor, tablo anatomisi (36px/13px) doğru — tasarım kaynaklı düşüş yok.');
setRoute('/ihracat/sevkiyatlar/yeni', ALL5, 'Tur 12 ile aynı (60). 390px tek kolon, 0 dokunma ihlali (1×1 gizli native select sayılmaz), odak halkası görünür.');
setRoute('/ihracat/belgeler', ALL5, 'Tur 12 ile aynı (60). Müşteri sütunu distinct=1/30 (342px) veri inceliği olarak kaydedildi, bulgu açılmadı.');
setRoute('/ihracat/kurlar', ALL5, 'Tur 12 ile aynı (60). Açık P2 ihracat-kurlar-13 kazanmayı engellemiyor.');
setRoute('/ihracat/gtip', ALL5, 'Tur 12 ile aynı (60).');

// Detay rotası: yeni P1 iki kriteri düşürüyor.
const detay = [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 4, 5];
setRoute(
  '/ihracat/sevkiyatlar/[id]',
  detay,
  'Kriter 9 (mobil düzen): 5→4 — kapalı+faturalı sevkiyatın Fatura & kur sekmesindeki fatura bağlantısı 390px\'te 137×19,5px (yükseklik 44 < 44) ve dokunmatikte hiçbir bağlantı işareti taşımıyor (ihracat-detay-23). ' +
    'Kriter 11 (tutarlılık): 5→4 — aynı sayfada iki belge bağlantısı farklı: "Bağlı irsaliye" DN bağlantısı text-primary + underline + min-h-11, "İhracat faturası" INV bağlantısı gövde rengi + alt çizgisiz + 19,5px. ' +
    'Diğer 10 kriter Tur 12 ile aynı: satır 36px, taşma yok, Vade 7/8 + Net/Brüt kg dolu, odak halkası 6/6 görünür, koyu tema doğrulandı. Toplam 58 (≥57) ama açık P1 nedeniyle rota kazanmıyor.',
);

routes['/ihracat/sevkiyatlar/[id]'].open = [
  {
    id: 'ihracat-detay-23',
    criterion: 9,
    severity: 'P1',
    text:
      '"Fatura & kur" sekmesindeki "İhracat faturası" kartında faturaya giden TEK bağlantı (INV-…) 390px\'te 137×19,5px — dikey dolgu/min-height yok — ve dokunmatik cihazda bağlantı olduğuna dair hiçbir işaret taşımıyor: rengi gövde metniyle birebir aynı (oklch(0.21 0.006 285.9)), text-decoration:none, tek işaret `hover:underline` ve o da globals.css:10 @custom-variant hover ile (hover:hover) and (pointer:fine) altında olduğundan dokunmatikte hiç tetiklenmiyor. Bu, Tur 11\'de "Bağlı irsaliye" için kapatılan ihracat-detay-22\'nin AYNI DOSYADAKİ ikizi (satır 246 düzeltilmiş, satır 162 atlanmış); bu yüzden aynı sayfada iki belge bağlantısı farklı görünüyor (kriter 11 de 4\'e düştü). Yalnızca faturası olan sevkiyatta (EXP-2026-000001) render edildiği için Tur 11/12 probları (EXP-2026-000002, faturasız) bunu göremedi.',
    measure:
      '390x844 ve 1440x900, /ihracat/sevkiyatlar/<EXP-2026-000001>, "Fatura & kur" sekmesi — probe-ihracat-r13d.json: a[href^="/muhasebe/faturalar/"] 137×19,5px, color=oklch(0.21 0.006 285.9) (= body color), textDecorationLine=none. Karşılaştırma, aynı sayfa: a[href^="/depo/sevkiyat/"] 332×44px (390px), iç span color=oklch(0.55 0.16 152) + underline.',
    target:
      'Bağlantı kutusu ≥44px yükseklik (ör. `flex min-h-11 items-center`) VE hover\'dan bağımsız kalıcı bağlantı işareti (ihracat-detay-22 düzeltmesiyle aynı kalıp: doküman no `text-primary underline decoration-border underline-offset-2`). Kabul ölçütü: probe-ihracat-r13d.ts ile 390px\'te h ≥ 44 ve link rengi ≠ body rengi (ya da textDecorationLine=underline).',
    file: 'apps/web/src/app/(app)/ihracat/sevkiyatlar/[id]/page.tsx:162 (İhracat faturası kartındaki Link)',
    openedRound: 13,
  },
];

writeFileSync(P, JSON.stringify(card, null, 1));
console.error('ok');

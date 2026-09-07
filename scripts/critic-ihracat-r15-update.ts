/** Tur 15 ihracat kritik kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'artifacts/critic/ihracat.json';
const card = JSON.parse(readFileSync(P, 'utf8'));
const R = 15;

const notes: Record<string, string> = {
  '/ihracat/sevkiyatlar':
    'Tur 14 ile aynı (60). Kod değişmedi (git diff 057d76c..HEAD apps/web = boş), ölçümler baştan alındı ve eşleşti: 1440 scrollWidth=clientWidth=1440, tablo kapsayıcı scrollW=containerW=1152, satır 36px, h1 24px/600, 22 renk, satır hover rgba(0,0,0,0) → oklab(0.955 .../0.5). 390px: scrollW=clientW=390, kart 63,5px, 44px altı GERÇEK etkileşimli öğe 0 (yalnız breadcrumb <span> işaretlendi, tıklanabilir değil). 1024x768 operatör görünümü: sayfa taşması yok, geniş tablo yalnız kendi overflow-x kapsayıcısında kayıyor. Müşteri (3/3) ve Oluşturma (3/3) distinct=1 — tohum verisi inceliği, bulgu açılmadı.',
  '/ihracat/sevkiyatlar/[id]':
    'Kriter 11 (tutarlılık) 5→4: YENİ P1 shell-documentchain-order-01. Belge zinciri kartlarının sırası kayıtlar arasında değişiyor — EXP-2026-000001: Sipariş(x=264) › İrsaliye(472) › İhracat sevkiyatı(680) › Fatura(888); EXP-2026-000002: İrsaliye(264) › Sipariş(472) › İhracat sevkiyatı(680). İki kaydın bağlantı topolojisi BİREBİR aynı (document_links: sales_order→export_shipment + delivery→export_shipment, ikisi de derinlik 1); sırayı belirleyen tek şey document_index.doc_date içindeki tohum ekleme milisaniyesi. Aynı ekranda okun anlamı bir kayıtta doğru, diğerinde ters (irsaliye siparişin kaynağı gibi görünüyor — CLAUDE.md kural 3). Diğer 11 kriter Tur 14 ile aynı (5): 4 sekme × 2 viewport + kapalı/taslak özet yeniden çekildi, satır 36px, scrollW=containerW=1152, 390px 0 dokunma ihlali, "Fatura & kur" boş durumu ikon+başlık+açıklama ile özenli, Tur 13 P1 (ihracat-detay-23, fatura bağlantısı) kod okumasıyla kapalı doğrulandı: satır 162 ve 246 artık aynı kalıp (min-h-11 + text-primary + underline).',
  '/ihracat/sevkiyatlar/yeni':
    'Tur 14 ile aynı (60). 1440: scrollW=1440, gövde 13px (40 öğe), h1 24px/600, 13 renk. 390: scrollW=390, tek kolon, yapışkan alt aksiyon çubuğu; 44px altı gerçek hedef 0 — measure çıktısındaki 3 kayıt 1×1px gizli native <select> (shadcn Select yedeği, görünmez), breadcrumb ise <span>.',
  '/ihracat/belgeler':
    'Tur 14 ile aynı (60). 30 satır × 36px, scrollW=containerW=1152, 390px kart 60px, 0 dokunma ihlali, 20 renk. Belge sütunu distinct=12, Durum distinct=5. Müşteri sütunu distinct=1/30 (342px) tohumda tek ihracat müşterisi olduğundan — veri inceliği, bulgu açılmadı (Tur 12/13/14 kararıyla aynı).',
  '/ihracat/kurlar':
    'Tur 14 ile aynı (60). Stripe kalıbı korunuyor: KPI\'lar dikey hairline ayraçla, 90 günlük iki çizgili grafik, tablo 25×36px, Alış/Satış/Günlük değişim tabular-nums + sağ hizalı, delta rengi yalnız yön için. Koyu tema yeniden çekildi (ihracat-r15-kurlar-dark-1440.png): zemin/kart/ızgara tokenleri doğru, grafik çizgileri okunur. Açık P2 ihracat-kurlar-13 YENİDEN ÖLÇÜLDÜ, AÇIK: Kaynak sütunu 185px, distinct=1, 25/25 "TCMB" — kazanmayı engellemiyor.',
  '/ihracat/gtip':
    'Tur 14 ile aynı (60). 39 satır × 36,5–37px, scrollW=containerW=1152, 15 renk, 4 GTİP kartı üstte. 390px: kart 60px, 0 dokunma ihlali. SKU distinct=39, Ürün distinct=39, Tip distinct=2, GTİP distinct=2 — sütunların hepsi bilgi taşıyor.',
};

for (const [route, note] of Object.entries(notes)) {
  const r = card.routes[route];
  if (!r) throw new Error(`bilinmeyen route: ${route}`);
  r.round = R;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.scoreNotes = note;
  r.open ??= [];
}

// Detay rotası: kriter 11 düştü (yeni P1) — toplam 59, referans 57'nin üstünde ama açık P1 kazanmayı engelliyor.
const detay = card.routes['/ihracat/sevkiyatlar/[id]'];
detay.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5];
detay.total = 59;
detay.open.push({
  id: 'shell-documentchain-order-01',
  module: 'shell',
  criterion: 11,
  severity: 'P1',
  text:
    'DocumentChain kartlarının sırası aynı ekranın iki kaydında farklı: EXP-2026-000001 "Sipariş › İrsaliye › İhracat sevkiyatı › Fatura" (kanonik), EXP-2026-000002 "İrsaliye › Sipariş › İhracat sevkiyatı" (ters). İki kaydın bağlantı topolojisi birebir aynı (document_links: sales_order→export_shipment ve delivery→export_shipment, ikisi de derinlik 1). Kök neden: packages/core/src/documents/chain.ts:148 aynı derinlikteki düğümleri `doc_date` artan sıraya diziyor, document-chain.tsx:125 bu diziyi ters çeviriyor; document_index.doc_date tohum/oluşturma zaman damgası olduğu için sırayı 20–67 ms\'lik ekleme farkı belirliyor. Sonuç: kartlar arasındaki "›" oku bir kayıtta belge zincirinin gerçek yönünü, diğerinde tersini iddia ediyor (CLAUDE.md kural 3: teklif → sipariş → irsaliye → fatura).',
  measure:
    '1440x900, artifacts/critic/probe-ihracat-r15c.json — EXP-2026-000001: [Sipariş SO-2026-000023 @x264, İrsaliye DN-2026-000020 @472, İhracat sevkiyatı @680, Fatura INV-2026-000012 @888]; EXP-2026-000002: [İrsaliye DN-2026-000028 @264, Sipariş SO-2026-000031 @472, İhracat sevkiyatı @680]. psql document_index.doc_date: DN-2026-000020 11:39:09.668 < SO-2026-000023 11:39:09.735 (ters çevrilince Sipariş önce), SO-2026-000031 11:39:11.652 < DN-2026-000028 11:39:11.672 (ters çevrilince İrsaliye önce). Ekran görüntüleri: artifacts/screens/ihracat-r15-tabs/kapali-ozet-1440.png ve detay-belgeler-1440.png.',
  target:
    'Aynı derinlikteki düğümler tarihe değil KANONİK belge sırasına göre dizilsin (teklif < sipariş < irsaliye/mal kabul < ihracat sevkiyatı < fatura < tahsilat); tarih yalnız eşit ranktaki düğümler için ikincil anahtar kalsın. Kabul ölçütü: 3 sevkiyatın üçünde de zincir "Sipariş › İrsaliye › İhracat sevkiyatı › (Fatura)" sırasında render edilsin ve sıra art arda 2 yüklemede birebir aynı olsun (probe-ihracat-r15c.ts ile doğrulanabilir).',
  file: 'packages/core/src/documents/chain.ts:148 (toNodes sıralaması) + apps/web/src/components/document-chain.tsx:125 (chronologicalUpstream)',
  openedRound: R,
  not: 'Ortak bileşen + core kaynaklı — DESIGN-SCORECARD kural 5 gereği shell modülüne yazılır; aynı bulgu diğer modüllerde tekrar açılmaz. Ancak /ihracat/sevkiyatlar/[id] ekranında görünür olduğu için bu rotanın kazanmasını engeller.',
});

// açık P2 yeniden ölçüldü — measure alanı tazelendi
for (const o of card.routes['/ihracat/kurlar'].open) {
  if (o.id === 'ihracat-kurlar-13') {
    o.measure =
      '1440x900 /ihracat/kurlar, probe-ihracat-r15.json routes.kurlar.tables[0].cols[5]: Kaynak width=185px, distinct=1, rows=25, sample=["TCMB"]; psql: exchange_rates.source = TCMB-SEED(172) + TCMB(8) — ekranda tek etiket';
    o.lastMeasuredRound = R;
  }
}

card.crossModule ??= [];
card.crossModule.push({
  module: 'shell',
  id: 'shell-documentchain-order-01',
  criterion: 11,
  severity: 'P1',
  text: 'DocumentChain: aynı derinlikteki zincir düğümleri doc_date (tohum ms) sırasına göre diziliyor, bu yüzden belge zinciri kayıttan kayda ters yönde çizilebiliyor. Ayrıntı ve ölçüm: /ihracat/sevkiyatlar/[id] açık bulgusu.',
  file: 'packages/core/src/documents/chain.ts:148 + apps/web/src/components/document-chain.tsx:125',
  openedRound: R,
});

card.round = R;
card.note =
  'Tur 15. Tur 14 kartından (057d76c) bu yana apps/web altında TEK SATIR değişiklik yok (git diff --stat boş) — puanlar yeniden ölçüldü, gerekçesiz düşüş yapılmadı. Veritabanı yeniden tohumlandı, sevkiyat kimlikleri değişti. 6 rota × (1440x900 + 390x844) + detay 4 sekme × 2 viewport + kapalı/taslak özet + liste 1024x768 + kurlar koyu tema yeniden çekildi ve Read ile incelendi. Ölçüm: measure-ihracat-r15/ (12 dosya), probe-ihracat-r15.json (sütun genişliği/distinct + satır hover), probe-ihracat-r15c.json (zincir kart sırası, iki kayıt × iki yükleme). YENİ P1 shell-documentchain-order-01 (kriter 11): belge zinciri kart sırası kayıttan kayda ters dönüyor — kök neden core/documents/chain.ts:148 doc_date sıralaması + document-chain.tsx:125 reverse. Bu bulgu ortak bileşen kaynaklı (shell), fakat /ihracat/sevkiyatlar/[id] ekranında görünür olduğundan o rota bu tur KAZANMIYOR (59/57, açık P1). Diğer 5 rota 60/60, açık P0/P1 yok → kazanıyor. Açık P2 ihracat-kurlar-13 yeniden ölçüldü, açık (kazanmayı engellemiyor). Kod taraması TEMİZ: ihracat modülü + ihracat sayfalarında transition-all / transition: all / ease-in / scale(0) / ≥300ms süre / origin-* yok; tek animasyon fetch-rates-button.tsx animate-spin; 9 hover: kullanımının hepsi globals.css:10 gated variant üzerinden.';
card.measuredAt = new Date().toISOString();
card.updatedAt = new Date().toISOString().slice(0, 10);
card.shipmentIdUsed =
  '4748fced-4be1-4ba3-8075-bd8cece757f6 (EXP-2026-000001, kapalı, faturalı) · f598ae9c-04bc-400d-b908-55d8914eabcb (EXP-2026-000002, gümrükte) · 5d04e334-ba0c-4a2c-b069-d0a94116f61c (EXP-2026-000003, taslak) — veritabanı yeniden tohumlandı, Tur 13/14 kimlikleri geçersiz';
writeFileSync(P, JSON.stringify(card, null, 1));
console.error('ok');

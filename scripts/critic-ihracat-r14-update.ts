/** Tur 14 ihracat kritik kartı güncellemesi (docs/DESIGN-SCORECARD.md). */
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'artifacts/critic/ihracat.json';
const card = JSON.parse(readFileSync(P, 'utf8'));
const R = 14;

const notes: Record<string, string> = {
  '/ihracat/sevkiyatlar':
    'Tur 13 ile aynı (60). Tüm ölçümler yeniden alındı ve eşleşti: 1440 scrollWidth=clientWidth=1440 (overflowX=false), tablo kapsayıcı scrollW=containerW=1152, satır 36px, h1 24px/600, ekranda 8 font kademesi (10/11/12/13/14/15/18/24) ama gövde 13px baskın (49 öğe), 22 farklı renk. 390px: scrollW=clientW=390, kart 64px, 44px altı GERÇEK etkileşimli öğe 0 (breadcrumb-page bir <span>, tıklanabilir değil). 1024x768 operatör görünümü: belge scrollWidth=1024 (sayfa taşması yok), geniş tablo yalnızca kendi overflow-x kapsayıcısında kayıyor — kural gereği doğru. Odak halkası ekran görüntüsüyle doğrulandı (focus-sevkiyatlar-0/1.png: "Yeni sevkiyat" ve arama alanı görünür yeşil halka; getComputedStyle geçiş ortasında 0px okuyor, görsel kanıt esas alındı). Satır hover oklab(0.955 .../0.5). Para hücreleri tabular-nums + sağ hizalı, sıfır tutar soluk.',
  '/ihracat/sevkiyatlar/[id]':
    'Tur 13 ile aynı (60). EXP-2026-000002 (gümrükte) ve EXP-2026-000001 (kapalı) yeniden çekildi: kapalı sevkiyatta belge zinciri 4 halka (Sipariş → İrsaliye → İhracat sevkiyatı → Fatura), gümrüktekinde 3 halka + "Devam belgesi yok" kesik çerçeveli boş kutu. 4 sekmenin tümü (Sipariş satırları / Çeki listesi / Belgeler / Fatura & kur) masaüstü + 390px çekildi; hepsinde scrollW=containerW=1152, satır 36px. Fatura & kur boş durumu ikon+başlık+açıklama ile özenli, Kur bilgisi paneli dolu (EUR ₺37,2000, TL karşılığı ₺624.960,00). 390px: 0 dokunma ihlali, tek kolon, sekme şeridi yatay kayıyor. Koyu tema doğrulandı (dark-detay-1440.png).',
  '/ihracat/sevkiyatlar/yeni':
    'Tur 13 ile aynı (60). 1440: scrollW=1440, 13px gövde, 24px/600 başlık, 13 farklı renk. 390: scrollW=390, tek kolon, yapışkan alt aksiyon çubuğu; 44px altı gerçek hedef 0 (3 adet 1x1 gizli native select shadcn Select\'in yerel yedeği, sayılmaz). Sipariş seçici 11 seçenek taşıyor. Odak halkası ilk kontrolde 3px ring (oklab 0.55 -0.141 0.075 / 0.5) ölçüldü.',
  '/ihracat/belgeler':
    'Tur 13 ile aynı (60). 30 satır, satır 36px, scrollW=containerW=1152, 390px kart 60px ve 0 dokunma ihlali. Boş durum (arama "zzzqqq") ikon + "Eşleşen kayıt yok" + yönlendirme metniyle çekildi. Müşteri sütunu distinct=1/30 (342px) tohum verisinde tek ihracat müşterisi olduğundan; tasarım kaynaklı değil, bulgu açılmadı (Tur 12/13 kararıyla aynı).',
  '/ihracat/kurlar':
    'Tur 13 ile aynı (60). Stripe kalıbı korunuyor: KPI\'lar dikey hairline ayraçla, 90 günlük iki çizgili grafik (EUR mor / USD mavi), tablo 25 satır x 36px, Alış/Satış/Günlük değişim JetBrains Mono + tabular-nums + sağ hizalı, delta rengi yalnızca yön için. Tarih sütunu Inter/proporsiyonel (metin genişliği 68,56–71,38px) ama sola hizalı olduğundan raga görünmüyor — bulgu açılmadı. Açık P2 ihracat-kurlar-13 yeniden ölçüldü: Kaynak sütunu hâlâ 185px, distinct=1, 25/25 satır "TCMB" (DB\'de TCMB-SEED 172 + TCMB 8) — açık kalıyor, kazanmayı engellemiyor.',
  '/ihracat/gtip':
    'Tur 13 ile aynı (60). 39 satır x ~37px, scrollW=containerW=1152, 4 GTİP kartı üstte, satır içi GTİP seçici 44px dokunma yüksekliğinde (data-[size=default]:h-11). 390px: kart 60px, 0 dokunma ihlali. Boş durum çekildi. Tip sütunu distinct=2 (filtreli), GTİP sütunu distinct=2 — tohumda 38/39 ürün eşlenmemiş olduğundan; veri kaynaklı, bulgu açılmadı.',
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

// açık P2 yeniden ölçüldü — measure alanı tazelendi
const kurlar = card.routes['/ihracat/kurlar'];
for (const o of kurlar.open) {
  if (o.id === 'ihracat-kurlar-13') {
    o.measure = '1440x900 /ihracat/kurlar, probe-ihracat-r14.json kurlar.tables[0].cols[5]: Kaynak width=185px, distinct=1, rows=25, sample=["TCMB"]; psql: exchange_rates.source = TCMB-SEED(172) + TCMB(8) — ekranda tek etiket';
    o.lastMeasuredRound = R;
  }
}

card.round = R;
card.updatedAt = new Date().toISOString().slice(0, 10);
writeFileSync(P, JSON.stringify(card, null, 1));
console.error('ok');

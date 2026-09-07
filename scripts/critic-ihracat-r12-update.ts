/**
 * Tur 12 ihracat puan kartı güncellemesi (docs/DESIGN-SCORECARD.md).
 * Ölçüm kaynakları: artifacts/critic/probe-ihracat-r12{,b,c,d,e}.json,
 * artifacts/critic/measure-ihracat-r12/*.json, artifacts/screens/ihracat-r12-tabs/*.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'artifacts/critic/ihracat.json';
type Finding = Record<string, unknown>;
type Route = { round: number; scores: number[]; total: number; reference: string; open: Finding[]; closed: Finding[]; scoreNotes?: string };
const card = JSON.parse(readFileSync(PATH, 'utf8')) as { module: string; round: number; measuredAt?: string; routes: Record<string, Route> };

card.round = 12;
card.measuredAt = new Date().toISOString();

const set = (route: string, scores: number[], notes: string) => {
  const r = card.routes[route];
  if (!r) throw new Error(`route yok: ${route}`);
  r.round = 12;
  r.scores = scores;
  r.total = scores.reduce((a, b) => a + b, 0);
  r.scoreNotes = notes;
};

const FIVE = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

set('/ihracat/sevkiyatlar', FIVE,
  'Tur 11→12: delta YOK (60). Yeniden ölçüldü — probe-ihracat-r12.json: tablo 1152 = kapsayıcı 1152, 3 satır × 36px/13px, 10 sütunun 8\'i ≥2 farklı değer (Müşteri ve Oluşturma tek değerli, ikisi de tohum verisi kaynaklı: tek ihracat müşterisi, aynı gün oluşturma), para sütunları sağ hizalı + mono + tabular-nums, satır hover oklab(0.955 …/0.5) yalnız tıklanabilir satırlarda (probe-r12d.rowHover.changed=true). measure-ihracat-r12/sevkiyatlar-{1440,390}.json: scrollWidth=clientWidth her iki genişlikte, h1 24px/600 (mobilde 20px/600), 390\'da 3 kart × 63,5px ve gerçek dokunma hedefi ihlali 0 (tek kayıt breadcrumb-page span\'i, etkileşimli değil). Boş arama durumu ikon + "Eşleşen kayıt yok" + öneri (ihracat-r12-bos-sevkiyatlar.png). Gerçek Tab ile odak halkası görsel olarak doğrulandı (artifacts/critic/r12-focus/sevkiyatlar-{1..6}.png — 3px yeşil halka). 60/57 → KAZANAN: Plantero.');

set('/ihracat/sevkiyatlar/[id]', FIVE,
  'Tur 11→12: kriter 3 (yoğunluk) 4→5 ve kriter 9 (mobil düzen) 4→5; toplam 58→60. Kriter 3 gerekçesi: Tur 11\'de 4\'te tutulmasının İKİ ölçülen nedeni de kapandı — (a) Belgeler sekmesi "Vade" sütunu 0/8 dolu → 7/8 dolu ve 8 FARKLI tarih (probe-ihracat-r12.json detay:Belgeler → Vade width=163 rows=8 filled=7 distinct=8; tek boş satır "Gerekmiyor" işaretli ETGB), (b) Çeki listesi "Net kg"/"Brüt kg" 0/1 → 1/1 dolu (41,2 / 43,26) ve "Proforma & gümrük" kartındaki "Net / brüt ağırlık" artık "—/—" değil "41,2 kg / 43,26 kg". Kalan tek seyrek sütun "Belge no" (1/8) KUSUR SAYILMADI: değeri süreç ilerledikçe doluyor — kapanmış sevkiyatta (EXP-2026-000001) PF/INV/ETGB numaralarıyla 4/11 dolu, gerekli 5 satırın 3\'ünde numara var; mobil kartta boş alan hiç basılmıyor. Kriter 9 gerekçesi: ihracat-detay-22 (P1) kapandı — 390×844\'te gerçek dokunma hedefi ihlali 0 (measure-ihracat-r12/detay-390.json; tek kayıt breadcrumb-page span\'i, etkileşimli değil), sayfa scrollWidth=clientWidth=390, "Bağlı irsaliye" satırı artık tam genişlik + text-primary + kalıcı alt çizgi. Anatomi regresyonsuz: probe-ihracat-r8c-fix.ts ile deadRightPx=0, tablo 1152=panel 1152, tüm sütun slack\'leri ≤140 (<150 kabul eşiği). Kur bilgisi paneli ₺37,2000 / 07.09.2026 → exchange_rates(EUR, 2026-09-07, buying=37,200000) satırıyla birebir (ihracat-detay-17 kapalı kalıyor); ₺624.960,00 = €16.800 × 37,2. Taslak (EXP-2026-000003) ve kapalı (EXP-2026-000001) durumlarında eylem şeridi ve alan etiketleri değişiyor. 60/57 → KAZANAN: Plantero.');

set('/ihracat/sevkiyatlar/yeni', FIVE,
  'Tur 11→12: delta YOK (60). Yeniden ölçüldü — measure-ihracat-r12/yeni-{1440,390}.json: 1440 ve 390\'da taşma yok, 13/12 farklı renk, 3 font kademesi (13px gövde, 10-11px etiket, 20px h1 mobilde / 24px masaüstü), 390\'da tek kolon, görünür 44px altı etkileşimli hedef yok (3 adet 1×1 SELECT shadcn\'in gizli yerli elemanı, breadcrumb-page span\'i etkileşimli değil). Gerçek Tab ile odak halkası görsel doğrulandı: artifacts/critic/r12-focus/yeni-{1..6}.png — combobox, select tetikleyicisi ve düz metin alanlarının hepsinde 3px yeşil halka. 60/57 → KAZANAN: Plantero.');

set('/ihracat/belgeler', FIVE,
  'Tur 11→12: delta YOK (60). Yeniden ölçüldü — probe-ihracat-r12.json: 30 satır × 36px, tablo 1152 = kapsayıcı 1152, 5 sütun (Belge 12 farklı değer, Sevkiyat 3, Durum 5), 390\'da 30 kart × 60px ve gerçek dokunma ihlali 0. KPI şeridi 4 blok: Toplam 30 / Bekleyen 13 / Vadesi geçmiş 6 / Sorumlusuz 11 — Tur 11\'de kapatılan ihracat-belgeler-04 sayesinde "Vadesi geçmiş" artık 0\'a çakılı değil (6). "Müşteri" sütunu 30/30 aynı değeri basıyor ama bu YAPISAL değil veri kaynaklı (tohumda tek ihracat müşterisi var); ihracat-kurlar-13\'ten farkı: eşleme sütunu ASLA farklılaşamıyor, bu sütun üretimde farklılaşır — bu yüzden bulgu açılmadı. 60/57 → KAZANAN: Plantero.');

set('/ihracat/kurlar', FIVE,
  'Tur 11→12: delta YOK (60). Yeniden ölçüldü — probe-ihracat-r12.json: 25 satır × 36px, tablo 1152 = kapsayıcı 1152, Alış/Satış 23 farklı değer, Günlük değişim 18, Tarih 13; delta yeşil/kırmızı yalnız yön için; KPI iki blok dikey hairline ayraçla (USD satış ₺34,2237 / EUR satış ₺37,4000, alt satırda alış); ince çizgi grafik 2 seri + 5 kademeli eksen; 180 kayıt sayfalama; 390\'da taşma yok, dokunma ihlali 0. ihracat-kurlar-13 (P2) AÇIK KALDI — ölçüm birebir aynı (Kaynak width=185, distinct=1, 25/25 "TCMB"); rates-table.tsx\'e Tur 11\'de eklenen yorum defaultHidden denemesinin neden geri alındığını belgeliyor, ama bulgu kapanmadı. P2 kazanmayı engellemez. 60/56 → KAZANAN: Plantero.');

set('/ihracat/gtip', FIVE,
  'Tur 11→12: delta YOK (60). Yeniden ölçüldü — probe-ihracat-r12.json: 39 satır × 36,5–37px, tablo 1152 = kapsayıcı 1152, 4 sütunun 4\'ü ≥2 farklı değer (SKU 39, Ürün 39, Tip 2, GTİP 2), 15/13 farklı renk, GTİP kod kartları 4\'lü şeritte birim rozetiyle (KG/LT), 390\'da 39 kart × 60px ve dokunma ihlali 0, boş arama "Eşleşen kayıt yok" + ikon + öneri. 60/57 → KAZANAN: Plantero.');

// ihracat-kurlar-13 açık kalıyor — yeniden ölçüm kaydı
const kurlar = card.routes['/ihracat/kurlar']!;
const f13 = kurlar.open.find((f) => f.id === 'ihracat-kurlar-13');
if (!f13) throw new Error('ihracat-kurlar-13 bulunamadı');
(f13.recheck as Record<string, unknown> | undefined) ?? (f13.recheck = {});
(f13.recheck as Record<string, unknown>).round12 =
  'AÇIK. probe-ihracat-r12.json kurlar.tables[0].cols → Kaynak width=185, rows=25, filled=25, distinct=1, sample=["TCMB"]. psql: select source,count(*) from exchange_rates group by 1 → TCMB-SEED / TCMB (ikisi de UI\'da "TCMB"). Mobilde de 25/25 kartın meta satırında "TCMB" tekrar ediyor (artifacts/screens/ihracat-kurlar/mobile.png). Kaynak dosya rates-table.tsx Tur 11\'de yalnızca AÇIKLAMA yorumu aldı, davranış değişmedi.';

writeFileSync(PATH, JSON.stringify(card, null, 1));
console.error('ihracat.json güncellendi (Tur 12).');

/** Tur 7 kritik puan kartı güncellemesi (docs/DESIGN-SCORECARD.md). Yalnızca artifacts/critic/kokpit.json yazar. */
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'artifacts/critic/kokpit.json';
const card = JSON.parse(readFileSync(p, 'utf8'));
card.round = 7;
card.note = [
  'Tur 7 (kritik doğrulama, örnekleme Europe/Istanbul 7 Eylül 03:58-04:40): 5 rol kesiti yeniden çekildi (scripts/shot-kokpit-r3.ts, 1440x900 + 390x844).',
  'Ölçümler: artifacts/critic/measure-kokpit-r7/ (pnpm measure, 5 rol x 2 viewport) ve artifacts/critic/probe-kokpit-r7/ (YENİ scripts/probe-kokpit-r7.ts + probe-kokpit-r7b.ts:',
  'li KUTUSUNUN kendi yüksekliği [r7 probunda firstElementChild bazı listelerde satır sarmalayıcısı değil], bölüm bazında ayırt edicilik/birebir aynı satır sayısı,',
  'tam genişlikteki bölümler hariç kolon dibi dengesi, tabular-nums kapsaması, sağ kenar hizası, active/hover/focus kapsaması, 44px altı dokunma hedefleri).',
  'ÖNEMLİ FARK (Tur 6 vs Tur 7): Tur 6 gün dönümü SONRASI (01:57-03:10) örneklenmişti ve "Bugün"/"Bugünün tahsilatları"/"Kritik stok"/"Fire kırılımı" bölümleri BOŞTU;',
  'bu turda "Bugün" (8-10 satır), "Karantina", "Son siparişler", "Son iş emirleri" DOLU durumda ölçüldü — yani dolu-durum anatomisi ilk kez bu turda görüldü.',
  'TUR 6 KAPANIŞLARI YENİDEN ÖLÇÜLDÜ, HEPSİ KAPALI KALDI: kokpit-admin-col-balance-03 (FlowGrid colSpread 73px, hedef <=200; probe r7 admin-1440.json),',
  'kokpit-activity-row-anatomy-01 ("Son aktiviteler" 8/8 satır 40-41px = Banka/SKT riski/Geciken alacak ile aynı), kokpit-fin-payments-row-h11-01 (finance-dashboard.tsx:177 RowLink),',
  'kokpit-depo-empty-action-04 (görünen 3 boş durumun 3/3\'ü ikon + 2 metin satırı + eylem: Kritik stok, Bugünün tahsilatları, Fire kırılımı — probe r7 *-390.json empties),',
  'kokpit-satis-kpi-title-trunc-01 (satis 390: clipped listesi BOŞ), kokpit-fold-rows-01/kokpit-fin-fold-rows-01/kokpit-uretim-fold-rows-02 (katlama üstü bilgi birimi',
  'admin 17 / depo 25 / muhasebe 30 / satış 20 / üretim 19 — hepsi >=15).',
  'KOD DÜZEYİ TARAMA (kokpit modülü + kpi-card/kpi-strip/empty-state/status-badge + globals.css): `transition: all` YOK, `ease-in` YOK, `scale(0)` YOK, >=300ms süre YOK;',
  'hover globals.css:10 `@custom-variant hover` ile (hover:hover) and (pointer:fine) kapısından geçiyor; :active scale(0.97) yalnızca transform, 140ms, :not(:focus-visible) korumalı;',
  'prefers-reduced-motion bloğu mevcut ve spinner/pulse istisnaları düzgün. Bu turda kod düzeyi bulgu YOK.',
  'FOKUS DİLİ DOĞRULAMASI (kriter 8): klavye Tab ile gerçek :focus-visible ölçüldü — RowLink/StatStrip satırları `ring-2 ring-inset` (yeşil), KpiCard ve "Tümü" bağlantıları',
  'globals.css:157 `outline-ring/50` ile tarayıcının auto halkasını AYNI yeşil token ile boyuyor; iki halka aynı dili konuşuyor (renk+yarıçap), yalnızca kalınlık/alfa farklı — P2 altı, bulgu açılmadı.',
  'YENİ AÇIK BULGULAR (2, ikisi de P1): kokpit-uretim-downtime-row-anatomy-05 (üretim şefi "Son duruşlar" elle yazılmış li — mobilde 39.5-41px, aynı ekrandaki her liste 60-65.5px)',
  've kokpit-fin-recon-discriminator-05 (mutabakat kuyruğu satırı yalnızca ad+tutar taşıyor; 8 satırın 3\'ü birebir aynı metin, güven yüzdesi 0,15-0,90 arası değişirken hiç gösterilmiyor).',
].join(' ');

const R = card.routes;

// --- admin: değişiklik yok, doğrulandı
R['/kokpit?rol=admin'].round = 7;
R['/kokpit?rol=admin'].scoreNotes = {
  ...R['/kokpit?rol=admin'].scoreNotes,
  '3': "5 — Tur 7 (DOLU durum): katlama üstü bilgi birimi 17 (11 li + 2 özet satırı + 4 KPI); satır 40px (tek satırlık) / 52,5-55,5px (2-3 satırlık); mobil kart 60-65,5px (band 56-72). measure-kokpit-r7/admin-*.json.",
  '5': '5 — hairline ayraç, taşma yok (scrollW 1440 = clientW; 390 = 390), bölüm bazında sayı sütunu sağ kenar sapması 0px (probe r7b rightSpread: Bugün 0, Son aktiviteler 0, Banka 0, Üretim hatları 0, SKT riski 0, Geciken alacak 0).',
  '11': '5 — Tur 7: ekrandaki TÜM liste satırları shared.tsx Row/RowLink tabanından geliyor; tek satırlık küme {40, 41}, 2-3 satırlık küme {52,5; 54,5; 55,5} (fark 3px, band <=56).',
};

// --- depo: değişiklik yok
R['/kokpit?rol=depo'].round = 7;
R['/kokpit?rol=depo'].scoreNotes = {
  ...R['/kokpit?rol=depo'].scoreNotes,
  '3': '5 — Tur 7: katlama üstü bilgi birimi 25 (16 li + 1 özet + 4 şerit hücresi + 4 KPI); satır 40-41px; mobil 62,5-64,5px.',
  '2': '5 — kolon dibi farkı 58px (Karantina 529 / SKT riski 587; tam genişlikteki "Bugün" hariç), hedef <=200px.',
};

// --- satis: değişiklik yok
R['/kokpit?rol=satis'].round = 7;
R['/kokpit?rol=satis'].scoreNotes = {
  ...R['/kokpit?rol=satis'].scoreNotes,
  '3': '5 — Tur 7: katlama üstü bilgi birimi 20 (17 li + 3 KPI); liste satırı 40-41px, mobil 62,5-64px. "Satış hunisi"nin 16px li satırları LİSTE değil GRAFİK satırı (etiket + RankBar + sayı, space-y-2.5 → 26px adım) — kanal/huni çubukları kokpitte tek anatomi.',
  '5': '5 — sağ kenar sapması 0px (En çok satan 5, Son siparişler); taşma yok; 390px\'te kırpılan metin YOK (probe r7 satis-390.json clipped: []).',
};

// --- muhasebe: kriter 5 → 4, yeni P1
const mu = R['/kokpit?rol=muhasebe'];
mu.round = 7;
mu.scores = [5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5];
mu.total = 59;
mu.verdict = 'KAZANAN: Stripe';
mu.scoreNotes = {
  ...mu.scoreNotes,
  '5': "4 (5→4, gerekçe: kokpit-fin-recon-discriminator-05) — satır anatomisi hairline/hizalama tarafında kusursuz (rightSpread 0, taşma yok) ama \"Mutabakat kuyruğu\" satırı yalnızca 2 alan taşıyor (ad + tutar): 8 satırın 3'ü BİREBİR aynı metin (\"Trendyol Pazaryeri ₺5.000,00\"), ve satırın kararını belirleyen güven yüzdesi (props'ta hazır, 0,15-0,90 arası değişiyor) hiç basılmıyor. Bir satır, komşusundan ayırt edilemiyorsa anatomi eksiktir.",
  '3': '5 — katlama üstü bilgi birimi 30 (13 li + 1 özet + 11 şerit hücresi + 5 KPI); satır 40-41px, mobil 63-64px.',
};
mu.open = [{
  id: 'kokpit-fin-recon-discriminator-05',
  criterion: 5,
  severity: 'P1',
  text: '"Mutabakat kuyruğu" satırı yalnızca ad + tutar basıyor; aynı gün, aynı tutarlı öneriler birbirinden ayırt edilemiyor ve önerinin KARARINI belirleyen güven (confidence) hiç gösterilmiyor. Sonuç: 8 satırın 3\'ü birebir aynı metin, %90 güvenli bir eşleşme ile %15 güvenli bir eşleşme aynı ağırlıkta görünüyor. Liste ayrıca txDate\'e göre sıralı — tüm kayıtlar aynı gün olduğu için sıra fiilen rastgele. Veri zaten props\'ta: ReconciliationQueueItem { txDate, description, counterpartyName, confidence } (packages/core/src/cockpit/kpis.ts:441).',
  measure: 'artifacts/critic/probe-kokpit-r7/muhasebe-1440b.json → dupes: [{ section: "Mutabakat kuyruğu", text: "Trendyol Pazaryeri₺5.000,00", n: 3 }]; DB: aynı 8 kaydın confidence değerleri 0,90 / 0,15 / 0,15 / 0,85 / 0,33 / 0,33 / 0,23 / 0,75 — ekranda hiçbiri görünmüyor.',
  target: 'Satır üçüncü bir alan taşısın: güven yüzdesi (11px, text-muted-foreground, tabular-nums, tutarın solunda; ör. "%90"), sıralama confidence DESC olsun (bileşen içinde sort ya da kpis.ts orderBy). Kabul: probe-kokpit-r7b dupes listesi "Mutabakat kuyruğu" için BOŞ; satır yüksekliği 40px (RowLink) değişmez.',
  file: 'apps/web/src/modules/kokpit/components/finance-dashboard.tsx:106-115',
  openedRound: 7,
}];

// --- uretim: kriter 3 ve 11 → 4, yeni P1
const ur = R['/kokpit?rol=uretim'];
ur.round = 7;
ur.scores = [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 4, 5];
ur.total = 58;
ur.verdict = 'KAZANAN: Linear';
ur.scoreNotes = {
  ...ur.scoreNotes,
  '3': '4 (5→4, gerekçe: kokpit-uretim-downtime-row-anatomy-05) — masaüstü yoğunluğu doğru (katlama üstü 19 bilgi birimi, satır 40 / 52,5-55,5px) ama MOBİLDE "Son duruşlar" satırları 39,5-41px\'te kalıyor; puan kartının mobil bandı 56-72px ve aynı ekrandaki diğer iki liste 64,5-65,5px. Aynı sayfada iki farklı mobil satır yoğunluğu.',
  '11': '4 (5→4, aynı bulgu) — "Son duruşlar" listesi shared.tsx `Row`/`RowLink` tabanını kullanmıyor, elle yazılmış `<li className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">`. Bu, Tur 5\'te "Son aktiviteler" için (kokpit-activity-row-anatomy-01) ve Tur 4\'te "Mutabakat kuyruğu" için (kokpit-fin-row-anatomy-01) kapatılan kök nedenin modüldeki SON kopyası.',
};
ur.open = [{
  id: 'kokpit-uretim-downtime-row-anatomy-05',
  criterion: 11,
  severity: 'P1',
  text: '"Son duruşlar" listesi kokpitin ortak satır tabanını (shared.tsx `Row`) kullanmıyor: elle yazılmış `<li className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">`. İki sonucu var: (a) mobilde `max-sm:min-h-11` yok — satır 39,5-41px\'te kalıyor, aynı ekrandaki "Hat durumu" (64,5-65,5px) ve "Son iş emirleri" (64,5-65,5px) ile yan yana iki farklı yoğunluk okunuyor (kokpit-uretim_sefi/mobile.png, "Son duruşlar" bloğu); (b) masaüstünde yükseklik içeriğe göre 39,5 / 40,5 / 41px arasında geziniyor, `Row` ise `sm:h-10` ile 40px\'e sabitliyor.',
  measure: 'artifacts/critic/probe-kokpit-r7/uretim_sefi-390b.json → "Son duruşlar" { heights: [41, 40.5, 39.5] } ; aynı dosyada "Hat durumu" [65.5, 64.5], "Son iş emirleri" [65.5, 64.5]. Masaüstü (uretim_sefi-1440b.json) "Son duruşlar" [41, 40.5, 39.5], diğerleri [53.5,52.5] / [55.5,54.5].',
  target: 'Satır `Row` (shared.tsx) ile basılsın (tıklanabilir hedef yok → `RowLink` değil). Kabul: 390px\'te "Son duruşlar" satır yüksekliği 60-66px bandında ve >=44px; 1440px\'te tek değer 40px; probe-kokpit-r7b bySection["Son duruşlar"].heights tek elemanlı.',
  file: 'apps/web/src/modules/kokpit/components/production-chief-dashboard.tsx:113-125',
  openedRound: 7,
}];

for (const k of Object.keys(R)) {
  R[k].shots = R[k].shots ?? [];
  if (!R[k].open?.length) R[k].verdict = 'KAZANAN: Plantero';
}

writeFileSync(p, JSON.stringify(card, null, 1) + '\n');
console.log('kokpit.json güncellendi (tur 7)');

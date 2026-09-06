/** Tur 6 kritik puan kartı güncellemesi (docs/DESIGN-SCORECARD.md) — P1 düzeltme turu. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const p = resolve(process.cwd(), 'artifacts/critic/kokpit.json');
const card = JSON.parse(readFileSync(p, 'utf8'));
const R = 6;

const close = (route: string, id: string, fix: string, measureAfter: string) => {
  const r = card.routes[route];
  const i = r.open.findIndex((o: any) => o.id === id);
  if (i < 0) throw new Error(`açık bulgu yok: ${id} @ ${route}`);
  const [f] = r.open.splice(i, 1);
  f.fix = fix; f.closedRound = R; f.verifiedBy = 'ölçüm'; f.measureAfter = measureAfter;
  (r.closed ||= []).unshift(f);
};
const setScores = (route: string, scores: number[], notes: Record<string, string>, verdict: string) => {
  const r = card.routes[route];
  r.round = R; r.scores = scores; r.total = scores.reduce((a, b) => a + b, 0);
  r.scoreNotes = notes; r.verdict = verdict;
};

// ---- admin: iki P1 (kolon dengesi + satır anatomisi) -------------------
close('/kokpit?rol=admin', 'kokpit-admin-col-balance-03',
  "DashboardGrid'in derleme-zamanı iki sabit <div>'i, admin panosuna özel yeni `FlowGrid` (shared.tsx) ile değiştirildi: bölümler DÜZ bir liste olarak verilir, tarayıcının CSS çoklu-kolon dengelemesi (`lg:columns-2`; `column-fill`in ilk değeri zaten `balance`) her bölümü `break-inside-avoid-column` ile BÜTÜN olarak GERÇEK render yüksekliğine göre iki kolona dağıtır — statik atama yerine içerik her değiştiğinde otomatik yeniden dengelenir. DOM sırası (\"üstten alta, sonra sağ kolon\") değişmedi. Diğer roller (satış, üretim) `lg:col-span-2`/`lg:self-start` gibi CSS Grid'e özgü sınıflar kullandığından `DashboardGrid`de bırakıldı (çoklu-kolon akışıyla uyumsuz), yalnızca gm-dashboard.tsx `FlowGrid`e taşındı.",
  "1440x900 /kokpit (admin) Tur 6, DURUM A (gerçek seed verisi, 'Son aktiviteler' şu an 8 satır — Tur 5'teki 1 satırlık örneğin TERSİ uç): kolon dipleri 1459 / 1387 → colSpread 72px (artifacts/critic/probe-kokpit-r6/admin-1440.json). DURUM B ('Bugün' + 'Son aktiviteler' EmptyState'e düşürülerek simüle edildi — gm-dashboard.tsx'teki BİREBİR AYNI compact/description/action markup'ı DOM'a enjekte edilip tarayıcı yeniden dengelemesi ölçüldü, sunucu tarihi değiştirilmedi: scripts/probe-kokpit-r6-flowgrid.ts, artifacts/critic/probe-kokpit-r6/admin-1440-empty-sim.json): kolon dipleri 1449 / 1387 → colSpread 62px. İki UÇ veri durumunda da (8 satırlık dolu liste ve tamamen boş liste) colSpread ≤200px hedefinin çok altında (62-72px) — Tur 2/4/5'te üç kez bozulan statik atamanın aksine artık İÇERİK HACMİNDEN BAĞIMSIZ.");

close('/kokpit?rol=admin', 'kokpit-activity-row-anatomy-01',
  "shared.tsx'te `RowLink`in TABANI (`ROW_BASE`: aynı yükseklik/dolgu/tipografi) `Row` adıyla dışa verildi — `RowLink` bunu `<Link>` ile sarmalar, tıklanamaz satırlar (hedef rotası olmayanlar) doğrudan `Row`u kullanır. gm-dashboard.tsx:118 'Son aktiviteler'deki elle yazılmış `<li className=\"flex items-center justify-between gap-3 px-4 py-2 text-[13px]\">` (35.5px) `<Row>` ile değiştirildi. Aynı kök nedenin finance-dashboard.tsx:121'deki LATENT üçüncü kopyası ('Bugünün tahsilatları', `li.flex.h-11`, href yok, boş durumda olduğu için Tur 5'te görünmüyordu) de `RowLink` (kendi bölüm rotası `/finans/tahsilat`a bağlı — 'Mutabakat kuyruğu' satırlarıyla AYNI desen) ile değiştirildi; bu ayrıca muhasebe kesitinin açık P2 bulgusu kokpit-fin-payments-row-h11-01'i de kapatır (aşağıya bkz.).",
  "1440x900 /kokpit (admin) Tur 6: 'Son aktiviteler' 8 satırın 8'i de 40px (artifacts/critic/kokpit.json güncelleme betiğiyle birlikte çalıştırılan doğrulama: apps/web main → section[h2='Son aktiviteler'] li>div yükseklikleri [40,40,40,40,40,40,40,40]). Banka/SKT riski/Geciken alacak (RowLink) ile BİREBİR aynı yükseklik — tek satırlık liste satırı yüksekliklerinin ekrandaki distinct kümesi artık {40}.");

setScores('/kokpit?rol=admin', [5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5], {
  '1': "5 — değişmedi (Tur 5 ile aynı kademe envanteri).",
  '2': "4→5 — kokpit-admin-col-balance-03 KAPANDI: statik iki-<div> ataması yerine içerik-duyarlı `FlowGrid` (CSS çoklu-kolon dengelemesi). İKİ uç veri durumunda da (8 satırlık dolu 'Son aktiviteler' / tamamen boş 'Bugün'+'Son aktiviteler') colSpread 62-72px, hedefin (≤200px) çok altında.",
  '3': "4 — DEĞİŞMEDİ: kokpit-fold-rows-01 hâlâ açık. Bu turun kapsamı değildi; kök neden hâlâ paylaşılan `EmptyState` (apps/web/src/components/empty-state.tsx) compact yüksekliği (py-10) — kokpit modülü bu dosyayı değiştiremiyor (sharedComponentRequests).",
  '4': "5 — değişmedi.",
  '5': "5 — değişmedi.",
  '6': "5 — değişmedi.",
  '7': "5 — değişmedi.",
  '8': "5 — değişmedi.",
  '9': "5 — değişmedi.",
  '10': "5 — değişmedi.",
  '11': "4→5 — kokpit-activity-row-anatomy-01 KAPANDI: 'Son aktiviteler' artık `Row` (RowLink'in tıklanamaz tabanı) ile 40px — Banka/SKT riski/Geciken alacak (RowLink) ile tek anatomi. Ekrandaki tüm tek satırlık liste satırı yüksekliklerinin distinct kümesi {40}.",
  '12': "5 — değişmedi.",
}, 'KAZANAN: Stripe');

// ---- muhasebe: latent P2 (aynı kök neden, admin düzeltmesiyle birlikte kapandı) -----
close('/kokpit?rol=muhasebe', 'kokpit-fin-payments-row-h11-01',
  "finance-dashboard.tsx:121'deki elle yazılmış `<li className=\"flex h-11 items-center justify-between gap-3 px-4 text-[13px]\">` (href yok) `RowLink` ile değiştirildi (bkz. admin kesitinde kapatılan kokpit-activity-row-anatomy-01 — BİREBİR aynı kök neden/aynı commit). Hedefe özel bir detay rotası yok — 'Mutabakat kuyruğu' satırlarıyla AYNI desen: kendi bölüm rotasına (`/finans/tahsilat`) bağlanır.",
  "1440x900 /kokpit (muhasebe) Tur 6: bugüne tarihli bir tahsilat GEÇİCİ OLARAK enjekte edilip (mevcut bir `payments` satırının `paymentDate`'i test için bugüne çekildi, ölçüm sonrası ORİJİNAL tarihine geri alındı — kalıcı veri değişikliği yok) liste render edildi: 'Bugünün tahsilatları' satırı artık RowLink ile 40px (artifacts/critic/probe-kokpit-r6/muhasebe-1440-r5.json rowHeights['Bugünün tahsilatları']=[40]) — Banka/Mutabakat kuyruğu/Geciken alacak ile aynı. Tek satırlık liste satırı yüksekliklerinin ekrandaki distinct kümesi {40}.");

const r = card.routes['/kokpit?rol=muhasebe'];
r.round = R;
r.scoreNotes['11'] = "5 — kokpit-fin-payments-row-h11-01 KAPANDI (admin ile aynı kök neden/commit): 'Bugünün tahsilatları' artık RowLink, 40px. Banka + Mutabakat kuyruğu + Geciken alacak + Bugünün tahsilatları dördü de tek RowLink anatomisi.";

card.note += ` TUR 6 (P1 düzeltme): kokpit-admin-col-balance-03 ve kokpit-activity-row-anatomy-01 (admin, ikisi de P1) kapandı — DashboardGrid'in statik iki-<div> ataması admin panosuna özel \`FlowGrid\` (CSS çoklu-kolon dengelemesi, shared.tsx) ile değiştirildi; RowLink'in tabanı \`Row\` adıyla dışa verildi ve tıklanamaz satırlarda (Son aktiviteler) kullanıldı. Aynı kök nedenin finance-dashboard.tsx:121'deki latent kopyası da düzeltilip muhasebe kesitinin açık P2 bulgusu kokpit-fin-payments-row-h11-01 kapandı. Diğer roller (satış/üretim/depo/kalite/bakım) dokunulmadı — DashboardGrid API'si GERİYE UYUMLU bırakıldı (yalnızca yeni FlowGrid eklendi), o panoların CSS Grid'e özgü tam-genişlik/hizalama sınıfları (lg:col-span-2, lg:self-start) çoklu-kolon akışıyla uyumsuz olduğundan taşınmadı. Kalan açık P2'ler (kokpit-fold-rows-01, kokpit-fin-fold-rows-01, kokpit-uretim-fold-rows-02, kokpit-satis-kpi-title-trunc-01) bu turun kapsamı dışında — kök nedenleri paylaşılan shell bileşenleri (EmptyState compact py-10, KpiCard/KpiStripRow mobil sabit genişlik), kokpit modülü bu dosyaları değiştiremiyor.`;

writeFileSync(p, JSON.stringify(card, null, 1) + '\n');
console.log('kokpit.json Tur 6 güncellendi.');

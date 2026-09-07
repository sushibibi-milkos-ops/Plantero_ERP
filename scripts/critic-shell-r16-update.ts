/**
 * Tur 16 (bu oturum; dosyanın kendi sayacında Tur 29) — orkestratörün doğrudan bildirdiği tek P2
 * bulguyu (scripts/gate.sh phase4 QA koşusunun bir önceki oturumda kill/pkill şüphesiyle erken
 * kesilmesi — uygulama kırığı DEĞİL, yalnızca doğrulama adımı yarıda kalmıştı) kapatır.
 * Aynı desen daha önce iki kez yaşandı (round 26 → shell-gate-e2e-phase4-timeout-01, round 28 →
 * -02); bu üçüncü tekrar -03 kimliğiyle kayıt altına alınır. Kod tarafında hiçbir değişiklik
 * gerekmedi — kanıt scripts/gate.sh phase4'ün bu oturumda BAŞTAN SONA (kill/pkill çağrılmadan)
 * yeniden çalıştırılıp gerçek Playwright sonucunun okunmasıdır. Ayrıca dosyadaki 2 kalıcı AÇIK
 * bulgu (shell-datatable-slack-01, shell-shared-devserver-flake-01) kod incelemesiyle yeniden
 * doğrulandı — ikisi de değişmemiş, gerekçesiyle AÇIK bırakıldı (gerekçesiz kapatma yasak).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const P = resolve(process.cwd(), 'artifacts/critic/shell.json');
type Finding = Record<string, unknown>;
type Route = { open: Finding[]; closed: Finding[]; [k: string]: unknown };
const card = JSON.parse(readFileSync(P, 'utf8')) as {
  module: string;
  round: number;
  note: string;
  routes: Record<string, Route>;
  measuredAt?: string;
};

const NEW_ROUND = 29; // dosyanın kendi sayacı (önceki: 28)
card.round = NEW_ROUND;
card.measuredAt = new Date().toISOString();

// --- Yeni kapanış: shell-gate-e2e-phase4-timeout-03 ---------------------------------------
const ROUTE_KEY = "genel (QA kapı koşusu doğrulama, Tur 16 / dosya sayacı 29)";
const closedFinding: Finding = {
  id: 'shell-gate-e2e-phase4-timeout-03',
  severity: 'P2',
  openedRound: NEW_ROUND,
  closedRound: NEW_ROUND,
  text:
    "Bu QA turunda (orkestratörün bildirdiği) bir önceki oturumda `scripts/gate.sh phase4` üretim-derlemesi doğrulama koşusu tamamlanamadan bitmişti: koşu başlatıldıktan kısa süre sonra bir süreç yönetimi olayı (o oturumun kendi kill/pkill çağrısı, port/PID çakışması şüphesiyle) arka plan sürecini erken sonlandırmış, `/tmp/plantero-gate/gate.log` yalnızca '== db:reset' satırında kalmıştı — `reset_exit`/`check_exit`/`build`/`e2e_exit` satırlarının hiçbiri üretilmemişti. Bu bir uygulama kırığı DEĞİLDİR; QA koşusunun kendisi yarıda kaldığı için önceki oturum hiçbir adımı gerçek tarayıcıda doğrulayamamıştı. Aynı sınıf kesinti dosyada daha önce de görülmüştü: round 26 → shell-gate-e2e-phase4-timeout-01, round 28 → -02; bu üçüncü tekrar.",
  route: 'N/A (süreç/altyapı doğrulaması, kod değişikliği yok)',
  file: 'N/A (süreç/altyapı doğrulaması, kod değişikliği yok)',
  fix:
    "Kod tarafında değişiklik YAPILMADI (gerekmiyordu) — bu bir doğrulama adımıydı. Bu oturumda öneriye birebir uyularak `mkdir -p /tmp/plantero-gate && nohup scripts/gate.sh phase4 /tmp/plantero-gate > /tmp/plantero-gate/gate.log 2>&1 &` ile YENİDEN başlatıldı ve `grep -q e2e_exit` görülene kadar (hiçbir kill/pkill çağrısı yapılmadan) periyodik olarak yoklandı; koşu build kilidini (/tmp/plantero-gate-build.lock) makinede eşzamanlı çalışan başka bir oturumla paylaştığı için önce kilidi bekledi, sonra kendi izole port/.next-gate'inde build+start+e2e'yi tamamladı.",
  measureAfter:
    "/tmp/plantero-gate/gate.log baştan sona: reset_exit:0, check_exit:0 ('Toplam ihlal: 0 — TÜM KURALLAR GEÇTİ', 67/67 kural), typecheck_exit:0, lint_exit:0, test_exit:0 (@plantero/core 343, @plantero/integrations 28, @plantero/ai 30, @plantero/web 33, @plantero/db 77 — hepsi geçti), build_exit:0 (izole port 33753, dist_dir .next-gate), health_own_pid_verified:1 (gate_pid:26480, health:{\"ok\":true,\"db\":true}), e2e_exit:0, '26 passed (1.4m)'. /tmp/plantero-gate/e2e.log'da 26 testin TAMAMI ([1/26]..[26/26]) tek tek 'passed' olarak listelendi (ihracat sevkiyat zinciri+kur farkı 11 adım, bakım arıza→downtime→OEE 3 adım, Ar-Ge board+reçete+BOM devri 4 adım, kokpit KPI doğrulama 3 adım, negatifler/RBAC 3 adım, K1 regresyonu 1 adım) — sahte/erken rapor değil, gerçek Playwright çıktısı. Koşu kendi temizliğini de tamamladı ('== temizlik' satırı göründü, ps ile gate.sh phase4 sürecinin artık mevcut olmadığı doğrulandı). Ek sağlık kanıtı: pnpm measure /kokpit --viewport 1440x900 ve --viewport 390x844 koşunun BİTİMİNDEN sonra ayrıca çalıştırıldı — scrollWidth=clientWidth (taşma yok) iki viewport'ta da, 31 satır [40,41,55.5] masaüstü / [60,63.5,65.5] mobil, uygulama sağlıklı çalışıyor.",
};

card.routes[ROUTE_KEY] = { open: [], closed: [closedFinding] };

// --- Kalıcı 2 AÇIK bulgu: kod incelemesiyle yeniden doğrulandı, DEĞİŞMEMİŞ, AÇIK bırakıldı ---
const RECHECK_NOTE_SLACK =
  " Tur 16 yeniden doğrulama (dosya sayacı 29, kod incelemesi): apps/web/src/modules/sales/components/price-lists-table.tsx 'Geçerlilik' hâlâ meta.width:150, channels-table.tsx 'Sipariş (ay)' hâlâ meta.width:100 — önceki turlardan (10/14/17/26) değişmemiş. shell'in kendi mekanizması (data-table.tsx meta.width/meta.flex) değişmedi, hâlâ doğru çalışıyor. Kök neden hâlâ 'satis' modülünün yazma kapsamında (CLAUDE.md kural 2 gereği shell bu dosyaları değiştiremez) — AÇIK bırakıldı, gerekçesiz kapatma yapılmadı.";
const RECHECK_NOTE_FLAKE =
  " Tur 16 (dosya sayacı 29): bu turda scripts/gate.sh phase4 (build+start+e2e, izole port/.next-gate) makinede eşzamanlı ikinci bir gate.sh koşusuyla (başka bir oturum, /tmp/plantero-gate-final4, aynı build kilidini paylaşarak) aynı anda çalıştı — flock sıraya soktu, çakışma/veri bozulması olmadı; paylaşılan :3000 dev sunucusu bu turda kendi kendine yeniden başlamadı (curl /api/health 200 kaldı). Bu, kod tarafında bir düzeltme YAPILDIĞI anlamına gelmiyor (next.config.ts hâlâ bu V8 bellek eşiğini yönetmiyor) — yalnızca bu turun gözlem penceresinde tetiklenmedi. Kapsam/kök neden değerlendirmesi önceki turlardan değişmedi, gerekçesiz kapatma yapılmadı, AÇIK bırakıldı.";

for (const [, route] of Object.entries(card.routes)) {
  for (const f of route.open ?? []) {
    if (f.id === 'shell-datatable-slack-01') {
      f.note = `${String(f.note ?? '')}${RECHECK_NOTE_SLACK}`;
      f.recheckedRound = NEW_ROUND;
    } else if (f.id === 'shell-shared-devserver-flake-01') {
      f.note = `${String(f.note ?? '')}${RECHECK_NOTE_FLAKE}`;
      f.recheckedRound = NEW_ROUND;
    }
  }
}

card.note = `${card.note}\nTur 16 notu (Tur 29, bu dosyanın kendi sayacı): orkestratörün doğrudan bildirdiği 1 kritik bulgu (P2, shell-gate-e2e-phase4-timeout-03 — bir önceki oturumda scripts/gate.sh phase4'ün kill/pkill şüphesiyle erken kesilmesi) kapatıldı. Kod tarafında değişiklik gerekmedi (uygulama kırığı değildi) — bu oturumda \`mkdir -p /tmp/plantero-gate && nohup scripts/gate.sh phase4 /tmp/plantero-gate > /tmp/plantero-gate/gate.log 2>&1 &\` ile YENİDEN başlatılıp hiçbir kill/pkill çağrılmadan \`grep -q e2e_exit\` görülene kadar yoklandı: reset_exit:0, check_exit:0 (67/67 kural GEÇTİ), typecheck_exit:0, lint_exit:0, test_exit:0 (5 paket, 511 test), build_exit:0, health_own_pid_verified:1, e2e_exit:0 — '26 passed (1.4m)' (phase4-export-maint-rnd.spec.ts, 26/26 gerçek Playwright sonucu, /tmp/plantero-gate/e2e.log satır satır doğrulandı). Aynı sınıf kesinti dosyada üçüncü kez görüldü (round 26 → -01, round 28 → -02, bu tur → -03) — kök neden hâlâ paylaşılan makinede QA koşularının süre bütçesi/eşzamanlılık kısıtı, shell kodunda bir kusur değil. Dosyadaki 2 kalıcı AÇIK bulgu (shell-datatable-slack-01: kök neden 'satis' modülü yazma kapsamında; shell-shared-devserver-flake-01: altyapı/eşzamanlılık, next.config.ts'in yönetmediği V8 bellek eşiği) bu turda da kod incelemesiyle/gözlemle yeniden doğrulandı, ikisi de değişmemiş — gerekçesiyle AÇIK bırakıldı. \`pnpm --filter @plantero/web typecheck\` ve \`pnpm --filter @plantero/web lint\` bu tur için ayrıca çalıştırıldı (kod değişikliği olmadığı için gate.sh içindeki tam monorepo typecheck/lint/test koşusu zaten yukarıdaki gate.log ile kanıtlandı) — TEMİZ.`;

writeFileSync(P, JSON.stringify(card, null, 2) + '\n');
console.log('yazıldı:', P, '→ round', NEW_ROUND);

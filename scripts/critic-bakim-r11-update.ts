import { readFileSync, writeFileSync } from 'node:fs';

const path = 'artifacts/critic/bakim.json';
type Finding = Record<string, unknown>;
type Route = { round: number; reference: string; referenceTotal: number; scores: number[]; total: number; verdict: string; scoreNotes: string; open: Finding[]; closed: Finding[] };
const card = JSON.parse(readFileSync(path, 'utf8')) as { module: string; round: number; note: string; measuredAt: string; routes: Record<string, Route> };

card.round = 12;
card.measuredAt = new Date().toISOString();
card.note =
  'Tur 11: 7 rotanın tamamı yeniden çekildi (pnpm shot) ve ölçüldü (artifacts/critic/measure-bakim-r11{,b}/*.json, scripts/probe-bakim-r11c.ts + probe-bakim-r11d.ts). ' +
  'KAPANDI: bakim-makineler-07 (P1, k6) — 390px mobil kartın metrik yuvasında artık çıplak tamsayı yok (0/36 ihlal; 11 kartta dd.MM.yyyy "Sonraki bakım", 25 kartta "—"). ' +
  'KAPANDI: bakim-isemirleri-detay-12 (P2, k4) — "Yapılıyor" dolgulu+pulse, "Tamamlandı" dolgusuz halka (border-2 + bg-background); renk tonu değişmeden anatomi farkı ölçülebilir. ' +
  'AÇIK KALDI: bakim-oee-04 (P2, shell/kpi-strip.tsx) — @390 KpiStripRow scrollWidth 792 > clientWidth 358 (OEE, 5 kart), aynı bileşen /bakim/makineler\'de 632 > 358 (4 kart). ' +
  'YENİ: bakim-isemirleri-detay-13 (P1, k5) — "Olay geçmişi" zaman çizgisi nedensel sıraya göre monoton değil ve deterministik değil: audit_log satırları aynı mikrosaniyeyi taşıyor, sorgu yalnızca asc(at) ile sıralıyor, ikincil anahtar yok. ' +
  'Kod taraması TEMİZ (bakım modülü): transition-all / transition: all / ease-in / scale(0) / ≥300ms süre / origin-* YOK; tek hareket `transition-transform group-hover:scale-105` (machine-detail.tsx fotoğraf döşemesi), `motion-safe:animate-pulse` (order-timeline.tsx) ve `animate-spin` (bekleyen aksiyon). `hover:` varyantı globals.css:9-16\'da @media (hover:hover) and (pointer:fine) ile global olarak korunuyor. ' +
  'VERİ NOTU (tasarım bulgusu DEĞİL, seed/db\'ye ait): "Tamamlandı" iş emirlerinde checklist_results tüm maddeleri done:false taşıyor (MO-2026-000003/4/5) — ekran veriyi doğru basıyor ama "Kontrol listesi tamamlandı" çözüm metniyle çelişiyor.';

const R = card.routes;

// --- /bakim/makineler ---
{
  const r = R['/bakim/makineler']!;
  r.round = 11;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5];
  r.total = 59;
  r.verdict = 'Plantero';
  r.scoreNotes =
    'Tur 11 delta (+1): k6 4→5. Gerekçe (scripts/probe-bakim-r11c.ts @390x844): bakim-makineler-07 kapandı — mobil kartların HİÇBİRİNDE (0/36) son satır çıplak tamsayı değil; 11 kartta kendini açıklayan "Sonraki bakım" tarihi (14.09.2026 / 07.10.2026 …), 25 kartta veri yokluğunu bildiren "—". Masaüstünde sayı sunumu değişmedi: "Çalışma saati 0 sa" ve "Açık iş emri 0" ikisi de sönük (text-muted-foreground), sağ hizalı, tabular. ' +
    'k9 4 kalır: KpiStripRow @390 scrollWidth 632 > clientWidth 358 (4 kart; 3. kart "Arızalı" etiket ortasından kesik) — kök neden ortak bileşen, bakim-oee-04 altında bir kez izleniyor. ' +
    'Değişmeyen ölçümler: satır 36,5–37px × 36 @13px, mobil kart 63,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:238, 11:110, 12:12}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px\'te 44px altı gerçek dokunma hedefi yok (yalnızca breadcrumb metni). Toplam 59 ≥ 57, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';
  const f = r.closed.find((c) => c.id === 'bakim-makineler-07');
  if (f) {
    f.measureAfter =
      'Tur 11 kritik doğrulaması (scripts/probe-bakim-r11c.ts @390x844): mobil kartlarda son satırı çıplak tamsayı olan kart 0; 11 kartta /\\d{2}\\.\\d{2}\\.\\d{4}/ eşleşmesi, 25 kartta "—". Ekran kanıtı: artifacts/screens/bakim-makineler/mobile.png.';
    f.verifiedBy = 'ölçüm (kritik, scripts/probe-bakim-r11c.ts, Tur 11)';
  }
}

// --- /bakim/planlar ---
{
  const r = R['/bakim/planlar']!;
  r.round = 11;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.verdict = 'Plantero';
  r.scoreNotes =
    'Tur 11 delta 0. Yeniden ölçüm (measure-bakim-r11/planlar-{1440,390}.json): satır 36px × 12 @13px, mobil kart 63,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), fontSizes {13:94, 12:21, 11:14}, distinctColors 17/15, h1 24px/600 (mobil 20px/600), 390px\'te 44px altı gerçek dokunma hedefi yok. 12/12 mobil kartta satır aksiyonu var → rozet sütunu tırtıklı DEĞİL (shell-mobile-card-action-gutter-01 bu rotayı etkilemiyor), 12/12 kartta metrik yuvası "Sonraki" tarihini basıyor. Bu rotada KPI şeridi yok → k9 5. Açık bulgu yok, toplam 60 ≥ 57 → KAZANAN: Plantero.';
}

// --- /bakim/is-emirleri ---
{
  const r = R['/bakim/is-emirleri']!;
  r.round = 11;
  r.scores = [5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.verdict = 'Plantero';
  r.scoreNotes =
    'Tur 11 delta 0. k5 4 kalır: mobil kart rozet sütunu hâlâ tırtıklı — satır aksiyonu YALNIZCA açık iş emrinde (MO-2026-000006) render edildiğinden o kartta rozet sağ kenarı ~313px, diğer 5 kartta ~363px. Kök neden ORTAK bileşen (components/data-table/mobile-cards.tsx) → shell-mobile-card-action-gutter-01 (P2, shell.json Tur 25\'te AÇIK); DESIGN-SCORECARD kural 5 gereği bu modülde bulgu açılmadı. Kazanmayı engellemez: bakım modülünde açık P0/P1 yok, toplam 59 ≥ 57. ' +
    'Değişmeyen ölçümler: masaüstü satır 36px × 6 (veritabanında 6 iş emri var, tümü ilk ekranda), mobil kart 62–64,5px, scrollWidth 1440=1440 / 390=390 (overflowX false), h1 24px/600 (mobil 20px/600), distinctColors 25/23, 390px\'te 44px altı gerçek dokunma hedefi yok. Renk disiplini doğrulandı (k4 5): tür/öncelik rozetleri nötr, yalnızca "Kritik" destructive, "Bildirildi" warning.';
}

// --- /bakim/is-emirleri/[id] ---
{
  const r = R['/bakim/is-emirleri/[id]']!;
  r.round = 11;
  r.scores = [5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5];
  r.total = 59;
  r.verdict = 'Linear';
  r.scoreNotes =
    'Tur 11 delta (+1/−1): k4 4→5, k5 5→4. k4 (+1): bakim-isemirleri-detay-12 kapandı — zaman çizgisi noktalarında "Yapılıyor" dolgulu + motion-safe:animate-pulse, "Tamamlandı" dolgusuz halka (border-2 + bg-background); renk tonu değişmeden ayrım anatomiye taşındı, ekranda doğrulandı (artifacts/screens/bakim-is-emirleri-42f49874-677c-4376-81b0-0786ad6f093d/desktop.png). ' +
    'k5 (−1): YENİ bulgu bakim-isemirleri-detay-13 (P1) — "Olay geçmişi" listesi nedensel sıraya göre monoton değil: MO-2026-000005\'te Yapılıyor → Planlandı → Tamamlandı (yaşam döngüsü sırası 2 → 1 → 3). Sıralama aynı zamanda deterministik değil; 3 audit satırı da 2026-09-07 07:13:37.137781+00 taşıyor ve sorgu yalnızca asc(at) ile sıralıyor. 6 iş emrinin 1\'i bugün yanlış, kalan 5\'i tesadüfen doğru. ' +
    'Değişmeyen ölçümler: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 20/19, fontSizes {13:44, 12:20, 11:12}, h1 24px/600 (mobil 20px/600). 390px\'te ölçülen 44px altı öğeler gerçek dokunma hedefi DEĞİL: kontrol listesi kutuları disabled (salt okunur, 16px) ve "Periyodik plan" satır içi metin bağlantısı (display:inline, 35,5px). Toplam 59 ≥ 57 ama açık P1 var → KAZANAN: Linear.';
  const f = r.closed.find((c) => c.id === 'bakim-isemirleri-detay-12');
  if (f) {
    f.measureAfter =
      String(f.measureAfter ?? '') +
      ' | Tur 11 kritik doğrulaması: /bakim/is-emirleri/42f49874-677c-4376-81b0-0786ad6f093d ekranında üç nokta üç ayrı anatomi taşıyor — Yapılıyor dolgulu yeşil, Planlandı dolgulu mavi (info), Tamamlandı dolgusuz yeşil halka. Kapalı kalır.';
  }
  r.open = [
    {
      id: 'bakim-isemirleri-detay-13',
      criterion: 5,
      severity: 'P1',
      text: '"Olay geçmişi" zaman çizgisi nedensel sıraya göre monoton değil ve sıralaması deterministik değil. Aynı iş emrinin audit_log satırlarının tamamı birebir aynı zaman damgasını taşıyor (seed tek transaction\'da yazıyor), sorgu ise yalnızca `asc(auditLog.at)` ile sıralıyor — ikincil anahtar olmadığı için satır sırası Postgres\'in döndürdüğü rastgele sıraya kalıyor. Sonuç: liste "başladı → planlandı → tamamlandı" gibi okunuyor; zaman çizgisi kendi anlattığı hikâyeyi çürütüyor.',
      measure:
        'scripts/probe-bakim-r11d.ts (6 iş emrinin tamamı, 1440x900): MO-2026-000005 → DOM sırası ["Yapılıyor","Planlandı","Tamamlandı"], yaşam döngüsü rankları [2,1,3] → monotonic=false (1/6 rota-kaydı ihlalli, 5/6 tesadüfen doğru). psql: `select at, action, after->>\'status\' from audit_log where record_id=\'42f49874-…\'` → üç satır da 2026-09-07 07:13:37.137781+00. queries.ts:288 `.orderBy(asc(auditLog.at))` tek anahtar.',
      target:
        'getMaintenanceOrderEvents sıralaması deterministik ve yaşam döngüsüne uygun olsun: `.orderBy(asc(auditLog.at), asc(<durum rank CASE: reported 0, planned 1, in_progress 2, waiting_parts 3, done 4, cancelled 5>), asc(auditLog.id))`. Kabul: probe-bakim-r11d.ts 6/6 iş emrinde monotonic=true ve aynı sayfa iki kez yüklendiğinde DOM sırası birebir aynı.',
      file: 'apps/web/src/modules/maintenance/queries.ts:282-288 (getMaintenanceOrderEvents)',
      openedRound: 11,
    },
  ];
}

// --- /bakim/makineler/[id] ---
{
  const r = R['/bakim/makineler/[id]']!;
  r.round = 11;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.verdict = 'Plantero';
  r.scoreNotes =
    'Tur 11 delta 0 (MK-001 / 2672d9b9-0ddd-4a3b-bcc8-ec0477500479). Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 19/18, h1 24px/600 (mobil 20px/600), fontSizes {13:37, 14:8, 12:9, 11:9}; "Son iş emirleri" bağlantı satırı 44px, sekme şeridi mobilde yatay kaydırma + kenar soldurma ile, 390px\'te 44px altı gerçek dokunma hedefi yok. Bu rotada KPI şeridi yok → k9 5. Boş bölüm metinleri yerinde ("Duruş kaydı yok."), "Boş alanları göster (4)" ile boş alanlar varsayılan olarak gizli. Açık bulgu yok, toplam 60 ≥ 57 → KAZANAN: Plantero.';
}

// --- /bakim/is-emirleri/yeni ---
{
  const r = R['/bakim/is-emirleri/yeni']!;
  r.round = 11;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  r.total = 60;
  r.verdict = 'Plantero';
  r.scoreNotes =
    'Tur 11 delta 0. Yeniden ölçüm: scrollWidth 1440=1440 / 390=390 (overflowX false), distinctColors 16/15, h1 24px/600 (mobil 20px/600), fontSizes {13:30, 14:4, 11:3}. 390px\'te 44px altı tek öğe FormSelect\'in 1×1 gizli native <select>\'i (ortak bileşen, görünmez — gerçek tetikleyici tam genişlik ve 44px). Mobil akış doğru sırada: QR okuyucu (odaklı) → "veya listeden seçin" ayracı → tek kolon form → yapışkan aksiyon çubuğu ("Vazgeç" / "Arızayı bildir", makine seçilene dek pasif). Bu rotada KPI şeridi yok → k9 5. Açık bulgu yok, toplam 60 ≥ 57 → KAZANAN: Plantero.';
}

// --- /bakim/oee ---
{
  const r = R['/bakim/oee']!;
  r.round = 11;
  r.scores = [5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 5, 5];
  r.total = 59;
  r.verdict = 'Plantero';
  r.scoreNotes =
    'Tur 11 delta 0. bakim-oee-04 (P2, kök neden ortak bileşen kpi-strip.tsx) yeniden ölçüldü ve AÇIK kaldı: @390x844 KpiStripRow scrollWidth 792 > clientWidth 358, 5 karttan yalnızca 2\'si tam görünür (scripts/probe-bakim-r11c.ts) — Tur 9/10 ile birebir aynı. İkinci yatay kaydırma bölgesi "Hat bazlı OEE" tablosu (scrollWidth 588 > clientWidth 324) bilinçli `scrollbar-thin scroll-fade-x` deseni, yeni bulgu açılmadı; k9\'un 4\'te kalmasının ikinci gerekçesi. ' +
    'Doğrulanan ölçümler: masaüstü scrollWidth 1440=1440, mobil 390=390 (overflowX false), tablo satırı 36px × 3, distinctColors 17/15, h1 24px/600 (mobil 20px/600), fontSizes {13:43, 11:38, 12:11}. Renk/seri disiplini (k4 5, k5 5) korunuyor: OEE tek vurgu rengiyle 2px düz, diğer üç seri nötr rampada farklı kesikli desenlerle; Pareto çubukları tek renk; "Hat bazlı OEE" hücreleri tabular-nums + sağ hizalı, OEE<%60 yalnızca destructive. P2 kazanmayı engellemez: toplam 59 ≥ 56, hiçbir kriter <4, açık P0/P1 yok → KAZANAN: Plantero.';
  const o = r.open.find((x) => x.id === 'bakim-oee-04');
  if (o) {
    o.measure =
      'Tur 11 yeniden ölçüm (scripts/probe-bakim-r11c.ts, 390x844): KpiStripRow scrollWidth 792 > clientWidth 358, tam görünen kart 2/5 — Tur 9/10 ile birebir aynı, değişmedi. Aynı bileşen /bakim/makineler @390\'da scrollWidth 632 > clientWidth 358 (4 kart, 3. kart kesik).';
  }
}

writeFileSync(path, JSON.stringify(card, null, 2) + '\n');
console.log('güncellendi:', path);
for (const [k, v] of Object.entries(card.routes)) console.log(k, v.total, v.verdict, 'open=' + v.open.length);

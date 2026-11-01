/**
 * Telefon (mobil) denetimi — tüm (app) + operatör rotalarını verilen ekran genişliklerinde açar,
 * duyarlılık sorunlarını ölçer ve artifacts/mobile-audit/<tarih>.json (+ .md özeti) yazar.
 *
 *   pnpm tsx scripts/mobile-audit.ts [--viewport 390x844] [--only /satis,/depo] [--label önce|sonra] [--out dosya-öneki]
 *
 * Ölçülenler (rota başına): yatay taşma + taşan eleman, 44px altı hedefler, 12px altı metin, 16px altı form
 * alanı (iOS yakınlaştırması), alt sekme çubuğunun içeriği örtmesi, mobil karta düşmeyen tablo, ekran dışına
 * taşan form alanı, dar sütunlu ızgara, KPI şeridi kaydırılabilirliği, gövde alt dolgusu.
 * Dinamik rota kimlikleri Postgres'ten (psql) seçilir; hesap: admin.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

type Viewport = { width: number; height: number };

function parseArgs(argv: string[]) {
  let viewport: Viewport = { width: 390, height: 844 };
  let only: string[] = [];
  let label = 'denetim';
  let out = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--viewport') {
      const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? '');
      if (!m) throw new Error('Geçersiz viewport');
      viewport = { width: Number(m[1]), height: Number(m[2]) };
    } else if (a === '--only') only = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--label') label = argv[++i] ?? label;
    else if (a === '--out') out = argv[++i] ?? '';
  }
  return { viewport, only, label, out };
}

function q(sql: string): string {
  return execFileSync('psql', ['-h', 'localhost', '-U', 'postgres', '-d', 'plantero', '-At', '-c', sql], {
    env: { ...process.env, PGPASSWORD: 'postgres' },
  })
    .toString()
    .trim()
    .split('\n')[0]!;
}

export function buildRoutes(): string[] {
  const id = (sql: string) => {
    try {
      return q(sql);
    } catch {
      return '';
    }
  };
  const so = id("select id from sales_orders where doc_type='order' limit 1");
  const qt = id("select id from sales_orders where doc_type='quotation' limit 1");
  const po = id('select id from purchase_orders limit 1');
  const inv = id("select id from invoices where status='posted' limit 1");
  const partner = id('select id from partners limit 1');
  const je = id('select id from journal_entries limit 1');
  const wo = id('select id from work_orders limit 1');
  const mo = id('select id from maintenance_orders limit 1');
  const machine = id('select id from machines limit 1');
  const lot = id('select id from stock_lots limit 1');
  const receipt = id('select id from receipts limit 1');
  const count = id('select id from stock_counts limit 1');
  const delivery = id('select id from deliveries limit 1');
  const transfer = id('select id from transfers limit 1');
  const qcCheck = id('select id from qc_checks limit 1');
  const qcTpl = id('select id from qc_templates limit 1');
  const recall = id('select id from recalls limit 1');
  const exp = id('select id from export_shipments limit 1');
  const loan = id('select id from loans limit 1');
  const product = id('select id from products limit 1');
  const bom = id('select id from boms limit 1');
  const rnd = id('select id from rnd_projects limit 1');
  // Operatör ekranı yalnızca açık (released/in_progress/paused) iş emrini gösterir; hattı o iş emrinden al
  const openWo = id("select id || '|' || line_id from work_orders where status in ('in_progress','paused','released') and line_id is not null limit 1");
  const [openWoId, openWoLine] = openWo ? openWo.split('|') : ['', ''];
  const line = openWoLine || id('select id from production_lines order by code limit 1');

  const dyn = (tpl: string, v: string) => (v ? [tpl.replace('{id}', v)] : []);
  const routes = [
    '/kokpit', '/onaylar', '/bildirimler',
    '/ana-veri/urunler', '/ana-veri/urunler/yeni', '/ana-veri/cariler', '/ana-veri/depolar', '/ana-veri/receteler',
    '/ana-veri/import', '/ana-veri/kod-yapisi',
    ...dyn('/ana-veri/urunler/{id}', product), ...dyn('/ana-veri/cariler/{id}', partner), ...dyn('/ana-veri/receteler/{id}', bom),
    '/satis/teklifler', '/satis/teklifler/yeni', '/satis/siparisler', '/satis/siparisler/yeni', '/satis/firsatlar',
    '/satis/fiyat-listeleri', '/satis/kanallar', '/satis/net-ciro',
    ...dyn('/satis/teklifler/{id}', qt), ...dyn('/satis/siparisler/{id}', so),
    '/satin-alma/siparisler', '/satin-alma/siparisler/yeni', '/satin-alma/tedarikciler', '/satin-alma/kritik-stok', '/satin-alma/onay-kuyrugu',
    ...dyn('/satin-alma/siparisler/{id}', po),
    '/depo/stok', '/depo/lotlar', '/depo/mal-kabul', '/depo/mal-kabul/yeni', '/depo/sevkiyat', '/depo/transfer', '/depo/transfer/yeni',
    '/depo/sayim', '/depo/skt', '/depo/etiket', '/depo/tara',
    ...dyn('/depo/lotlar/{id}', lot), ...dyn('/depo/mal-kabul/{id}', receipt), ...dyn('/depo/sayim/{id}', count),
    ...dyn('/depo/sevkiyat/{id}', delivery), ...dyn('/depo/sevkiyat/{id}/topla', delivery), ...dyn('/depo/transfer/{id}', transfer),
    '/uretim/hatlar', '/uretim/is-emirleri', '/uretim/is-emirleri/yeni', '/uretim/planlama',
    ...dyn('/uretim/is-emirleri/{id}', wo),
    '/kalite/kontroller', '/kalite/sablonlar', '/kalite/sablonlar/yeni', '/kalite/izlenebilirlik', '/kalite/geri-cagirma', '/kalite/tedarikci-skoru',
    ...dyn('/kalite/kontroller/{id}', qcCheck), ...dyn('/kalite/sablonlar/{id}', qcTpl), ...dyn('/kalite/geri-cagirma/{id}', recall),
    ...(lot ? [`/kalite/izlenebilirlik?lot=${lot}`] : []),
    '/muhasebe', '/muhasebe/faturalar', '/muhasebe/faturalar/yeni', '/muhasebe/tahsilatlar', '/muhasebe/tahsilatlar/yeni', '/muhasebe/yevmiye',
    '/muhasebe/yevmiye/yeni', '/muhasebe/hesap-plani', '/muhasebe/mizan', '/muhasebe/kdv', '/muhasebe/banka', '/muhasebe/mutabakat', '/muhasebe/donemler',
    ...dyn('/muhasebe/faturalar/{id}', inv), ...dyn('/muhasebe/yevmiye/{id}', je), ...dyn('/muhasebe/cariler/{id}/ekstre', partner),
    '/finans/nakit-akisi', '/finans/tahsilat', '/finans/tahsilat/yeni', '/finans/tahsilat-takibi', '/finans/banka', '/finans/butce',
    '/finans/krediler', '/finans/break-even', '/finans/tahmin',
    ...dyn('/finans/krediler/{id}', loan),
    '/ihracat/sevkiyatlar', '/ihracat/sevkiyatlar/yeni', '/ihracat/belgeler', '/ihracat/gtip', '/ihracat/kurlar',
    ...dyn('/ihracat/sevkiyatlar/{id}', exp),
    '/bakim/makineler', '/bakim/is-emirleri', '/bakim/is-emirleri/yeni', '/bakim/planlar', '/bakim/planlar/yeni', '/bakim/oee',
    ...dyn('/bakim/makineler/{id}', machine), ...dyn('/bakim/is-emirleri/{id}', mo),
    '/arge/projeler', '/arge/receteler',
    ...dyn('/arge/projeler/{id}/board', rnd), ...dyn('/arge/projeler/{id}/receteler', rnd),
    '/ayarlar/kullanicilar', '/ayarlar/roller', '/ayarlar/audit',
    '/operator',
    ...(line ? [`/operator/${line}`] : []),
    ...(line && openWoId ? [`/operator/${line}/${openWoId}`] : line && wo ? [`/operator/${line}/${wo}`] : []),
  ];
  return routes;
}

/** Tarayıcı bağlamında çalışır — serileştirilebilir düz nesne döner. */
function collect(): Record<string, unknown> {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const isVisible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const sel = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute('data-testid');
    if (testId) return `${tag}[data-testid="${testId}"]`;
    if (el.id) return `${tag}#${el.id}`;
    const slot = el.getAttribute('data-slot');
    const aria = el.getAttribute('aria-label');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);
    let s = tag;
    if (slot) s += `[data-slot="${slot}"]`;
    if (aria) s += `[aria-label="${aria.slice(0, 28)}"]`;
    else if (text) s += ` "${text}"`;
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return cls && !text ? `${s}.${cls}` : s;
  };
  /** Yatay kırpan/kaydıran bir atanın içinde mi (taşma "yerel" kalır) */
  const insideScroller = (el: Element): boolean => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      // Yalnızca gerçek kaydırıcılar (auto/scroll) taşmayı "yerel" yapar; overflow-hidden/clip (ör. kabuğun
      // overflow-x-clip'i) taşan içeriği sessizce keser — bu da bulgudur.
      if (/(auto|scroll)/.test(cs.overflowX)) return true;
      // Kasıtlı kırpma: `truncate` (text-overflow: ellipsis) kutusu içindeki metin yerel taşmadır
      if (cs.textOverflow === 'ellipsis') return true;
      p = p.parentElement;
    }
    return false;
  };

  const doc = document.documentElement;
  const cw = doc.clientWidth;
  const scrollWidth = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);

  // --- Yatay taşma: sağ kenarı görünüm genişliğini aşan, kaydırıcı içinde olmayan en derin elemanlar
  const overflowers: Array<{ selector: string; right: number; width: number }> = [];
  {
    const all = Array.from(document.body.querySelectorAll('*'));
    for (const el of all) {
      if (!isVisible(el) || el.closest('[aria-hidden="true"], [data-radix-popper-content-wrapper], [role="dialog"]') || getComputedStyle(el).position === 'fixed' || el.getAttribute('data-slot') === 'progress-indicator') continue;
      const r = el.getBoundingClientRect();
      if ((r.right > cw + 1 || r.left < -1) && !insideScroller(el)) {
        // yalnızca en derin: çocuğu da taşıyorsa ebeveyn sayılmaz
        const childOver = Array.from(el.children).some((c) => {
          const cr = c.getBoundingClientRect();
          return cr.width > 0 && cr.right > cw + 1;
        });
        if (!childOver) overflowers.push({ selector: sel(el), right: r1(r.right), width: r1(r.width) });
      }
    }
  }

  // --- Dokunma hedefleri
  const interactive = Array.from(
    document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="combobox"], [tabindex]:not([tabindex="-1"])',
    ),
  );
  const small: Array<{ selector: string; w: number; h: number }> = [];
  for (const el of interactive) {
    if (!isVisible(el) || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) small.push({ selector: sel(el), w: r1(r.width), h: r1(r.height) });
  }

  // --- 12px altı metin
  const tiny: Record<string, number> = {};
  const tinySamples: string[] = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    let hasText = false;
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.textContent ?? '').trim()) hasText = true;
    if (!hasText || !isVisible(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) {
      tiny[String(r1(fs))] = (tiny[String(r1(fs))] ?? 0) + 1;
      if (tinySamples.length < 6) tinySamples.push(sel(el));
    }
  }

  // --- 16px altı form alanı (iOS Safari odakta yakınlaştırır)
  const smallInputs: Array<{ selector: string; fs: number }> = [];
  for (const el of Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select'))) {
    if (!isVisible(el) || el.closest('[aria-hidden="true"]')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) smallInputs.push({ selector: sel(el), fs: r1(fs) });
  }

  // --- Ekran dışına taşan form alanları / tetikleyiciler (kesilmiş)
  const clippedFields: Array<{ selector: string; left: number; right: number }> = [];
  for (const el of Array.from(document.querySelectorAll('input, textarea, select, [role="combobox"], button'))) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > cw + 1 || r.left < -1) && !insideScroller(el)) clippedFields.push({ selector: sel(el), left: r1(r.left), right: r1(r.right) });
  }

  // --- Alt sekme çubuğu ve gövde alt dolgusu
  const nav = document.querySelector('nav[aria-label="Hızlı erişim"]');
  const main = document.querySelector('main');
  let bottomBar: Record<string, unknown> | null = null;
  if (nav && isVisible(nav)) {
    const navTop = nav.getBoundingClientRect().top;
    const mainCs = main ? getComputedStyle(main) : null;
    // Belgenin en altına kaydırıldığında son görünür içerik elemanı çubuğun altında mı kalıyor
    const maxScroll = doc.scrollHeight - window.innerHeight;
    window.scrollTo(0, maxScroll);
    let lowest = 0;
    let lowestSel = '';
    if (main) {
      for (const el of Array.from(main.querySelectorAll('*'))) {
        if (!isVisible(el) || el.children.length > 0) continue;
        if (el.closest('[aria-hidden="true"]') || el.closest('details:not([open])')) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > lowest && r.top < window.innerHeight + 4) {
          lowest = r.bottom;
          lowestSel = sel(el);
        }
      }
    }
    bottomBar = {
      navTop: r1(navTop),
      mainPaddingBottom: mainCs ? parseFloat(mainCs.paddingBottom) : null,
      lowestContentBottom: r1(lowest),
      lowestContent: lowestSel,
      covered: lowest > navTop + 1,
      coveredBy: r1(Math.max(0, lowest - navTop)),
    };
    window.scrollTo(0, 0);
  }

  // --- Mobil karta düşmeyen tablolar (görünür <table>)
  const tables = Array.from(document.querySelectorAll('main table'))
    .filter(isVisible)
    .map((t) => {
      const scroller = t.closest('[class*="overflow-x"]');
      const r = t.getBoundingClientRect();
      return {
        selector: sel(t),
        cols: t.querySelectorAll('thead th').length,
        rows: t.querySelectorAll('tbody tr').length,
        width: r1(r.width),
        scrollable: Boolean(scroller),
        inDataTable: Boolean(t.closest('[data-slot="data-table"], [data-datatable]')),
      };
    });

  // --- Çok sütunlu ızgara: ≥2 sütun ve sütun genişliği <150px
  const narrowGrids: Array<{ selector: string; cols: number; colWidth: number }> = [];
  for (const el of Array.from(document.querySelectorAll('main *'))) {
    const cs = getComputedStyle(el);
    if (cs.display !== 'grid' || !isVisible(el)) continue;
    const cols = cs.gridTemplateColumns.split(' ').filter((x) => x && x !== 'none');
    if (cols.length >= 2) {
      const widths = cols.map((c) => parseFloat(c)).filter((n) => !Number.isNaN(n));
      const minW = Math.min(...widths);
      if (widths.length >= 2 && minW < 150 && minW > 0) narrowGrids.push({ selector: sel(el), cols: widths.length, colWidth: r1(minW) });
    }
  }

  // --- Yatay kaydırıcılar (KPI şeridi, sekmeler, tablolar): kaydırılabilir mi
  const scrollers = Array.from(document.querySelectorAll('main *'))
    .filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && isVisible(el);
    })
    .slice(0, 12)
    .map((el) => ({ selector: sel(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));

  return {
    scrollWidth,
    clientWidth: cw,
    overflowX: scrollWidth > cw || overflowers.length > 0,
    overflowers: overflowers.slice(0, 8),
    touchTargetsBelow44: small,
    textBelow12: tiny,
    textBelow12Samples: tinySamples,
    inputsBelow16: smallInputs,
    clippedFields: clippedFields.slice(0, 8),
    bottomBar,
    tables,
    narrowGrids: narrowGrids.slice(0, 8),
    scrollers,
    h1: (document.querySelector('h1')?.textContent ?? '').trim().slice(0, 60),
    bodyTextLength: (document.body.innerText ?? '').length,
  };
}

function saveInterim(opts: { viewport: Viewport; label: string; out: string }, results: unknown[]) {
  const dir = join(process.cwd(), 'artifacts', 'mobile-audit');
  mkdirSync(dir, { recursive: true });
  const stem = opts.out || `ara-${opts.label}-${opts.viewport.width}x${opts.viewport.height}`;
  writeFileSync(join(dir, `${stem}.interim.json`), JSON.stringify(results));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const base = defaultBaseUrl();
  let routes = buildRoutes();
  if (opts.only.length) routes = routes.filter((r) => opts.only.some((o) => r.startsWith(o)));
  const browser = await launchBrowser();
  const results: Array<Record<string, unknown>> = [];
  try {
    const ctx = await browser.newContext({
      viewport: opts.viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
    });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120_000);
    await login(page, base, resolveAccount('admin'), '/kokpit');
    for (const route of routes) {
      const t0 = Date.now();
      try {
        let resp = null as Awaited<ReturnType<typeof page.goto>>;
        // Oturum düşmüşse (başka bir ajan db:reset koşabilir) yeniden giriş yap ve bir kez daha dene
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            resp = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 120_000 });
          } catch (e) {
            if (attempt === 2) throw e;
            await ctx.clearCookies();
            await login(page, base, resolveAccount('admin'), '/kokpit');
            continue;
          }
          if (page.url().includes('/login') && !route.startsWith('/login')) {
            await ctx.clearCookies();
            await login(page, base, resolveAccount('admin'), '/kokpit');
            continue;
          }
          break;
        }
        await page
          .waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 30_000 })
          .catch(() => {});
        await page.waitForTimeout(500);
        const data = (await page.evaluate(`(() => { const __name = (f) => f; return (${collect.toString()})(); })()`)) as Record<string, unknown>;
        results.push({ route, status: resp?.status() ?? 0, finalUrl: page.url().replace(base, ''), ms: Date.now() - t0, ...data });
        process.stderr.write(`ok ${route}\n`);
      } catch (err) {
        results.push({ route, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
        process.stderr.write(`HATA ${route}: ${err instanceof Error ? err.message.slice(0, 120) : err}\n`);
      }
      // Artımlı kayıt: uzun koşuda kesinti olursa ara sonuç kaybolmaz
      saveInterim(opts, results);
    }
    await ctx.close();
  } finally {
    await browser.close();
  }

  const date = new Date().toISOString().slice(0, 10);
  const dir = join(process.cwd(), 'artifacts', 'mobile-audit');
  mkdirSync(dir, { recursive: true });
  const stem = opts.out || `${date}-${opts.label}-${opts.viewport.width}x${opts.viewport.height}`;
  writeFileSync(join(dir, `${stem}.json`), JSON.stringify({ viewport: opts.viewport, label: opts.label, date, results }, null, 2));

  // Özet
  const sum = {
    routes: results.length,
    errors: results.filter((r) => r.error).length,
    overflow: results.filter((r) => r.overflowX).length,
    touch: results.filter((r) => ((r.touchTargetsBelow44 as unknown[]) ?? []).length > 0).length,
    touchItems: results.reduce((n, r) => n + ((r.touchTargetsBelow44 as unknown[]) ?? []).length, 0),
    tiny: results.filter((r) => Object.keys((r.textBelow12 as object) ?? {}).length > 0).length,
    inputs16: results.filter((r) => ((r.inputsBelow16 as unknown[]) ?? []).length > 0).length,
    covered: results.filter((r) => (r.bottomBar as { covered?: boolean } | null)?.covered).length,
    tables: results.filter((r) => ((r.tables as unknown[]) ?? []).length > 0).length,
    clipped: results.filter((r) => ((r.clippedFields as unknown[]) ?? []).length > 0).length,
    narrowGrids: results.filter((r) => ((r.narrowGrids as unknown[]) ?? []).length > 0).length,
  };
  writeFileSync(join(dir, `${stem}.summary.json`), JSON.stringify(sum, null, 2));
  process.stdout.write(JSON.stringify({ file: `artifacts/mobile-audit/${stem}.json`, ...sum }) + '\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});

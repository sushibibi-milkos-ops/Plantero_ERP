/**
 * Ölçüm aracı (docs/DESIGN-SCORECARD.md, kural 6):
 *   pnpm measure /route [--as admin] [--viewport 1440x900|390x844] [--base http://localhost:3000] [--dark]
 *
 * Playwright ile giriş yapar, sayfayı açar (networkidle + RSC/iskelet beklemesi — scripts/lib/browser.ts),
 * ardından tek satırlık JSON basar (stdout'a YALNIZCA JSON; hata/uyarılar stderr'e):
 * {
 *   route, viewport, scrollWidth, clientWidth, overflowX,
 *   rows: { count, heights: [min, median, max] },        // tbody tr; yoksa DataTable mobil kartları (ul > li)
 *   fontSizes: { "13": 120, "12": 40, ... },              // görünür metin taşıyan elemanların hesaplanmış font-size'ı (px)
 *   touchTargetsBelow44: [{ selector, w, h }],            // görünür etkileşimli elemanlar, w<44 veya h<44
 *   distinctColors: n,                                     // ilk 400 elemanın hesaplanmış metin + arka plan renkleri (saydam hariç)
 *   h1: { size, weight } | null,
 *   images: n
 * }
 * Kritik ve builder aynı betiği kullanır; `measure`/`target` alanları bu çıktıdan doldurulur.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

type Viewport = { width: number; height: number };

function parseArgs(argv: string[]) {
  let route = '/kokpit';
  let as = 'admin';
  let base = defaultBaseUrl();
  let viewport: Viewport = { width: 1440, height: 900 };
  let dark = false;
  const parseViewport = (v: string): Viewport => {
    const m = /^(\d+)x(\d+)$/.exec(v.trim());
    if (!m) throw new Error(`Geçersiz viewport: ${v} (örn. 1440x900 ya da 390x844)`);
    return { width: Number(m[1]), height: Number(m[2]) };
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--as') as = argv[++i] ?? as;
    else if (a.startsWith('--as=')) as = a.slice(5);
    else if (a === '--base') base = (argv[++i] ?? base).replace(/\/$/, '');
    else if (a.startsWith('--base=')) base = a.slice(7).replace(/\/$/, '');
    else if (a === '--viewport') viewport = parseViewport(argv[++i] ?? '');
    else if (a.startsWith('--viewport=')) viewport = parseViewport(a.slice(11));
    else if (a === '--dark') dark = true;
    else if (a.startsWith('/')) route = a;
    else throw new Error(`Bilinmeyen argüman: ${a}`);
  }
  return { route, as, base, viewport, dark };
}

export type Measurement = {
  route: string;
  viewport: string;
  scrollWidth: number;
  clientWidth: number;
  overflowX: boolean;
  rows: { count: number; heights: [number, number, number] };
  fontSizes: Record<string, number>;
  touchTargetsBelow44: Array<{ selector: string; w: number; h: number }>;
  distinctColors: number;
  h1: { size: number; weight: number } | null;
  images: number;
};

/** Tarayıcı içinde çalışır — DOM dışı hiçbir şeye erişmez, serileştirilebilir düz nesne döner. */
function collect(): Omit<Measurement, 'route' | 'viewport'> {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const isVisible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const shortSelector = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute('data-testid');
    if (testId) return `${tag}[data-testid="${testId}"]`;
    if (el.id) return `${tag}#${el.id}`;
    const slot = el.getAttribute('data-slot');
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
    let s = tag;
    if (slot) s += `[data-slot="${slot}"]`;
    else if (role) s += `[role="${role}"]`;
    if (aria) s += `[aria-label="${aria.slice(0, 24)}"]`;
    else if (text) s += ` "${text}"`;
    return s;
  };

  // --- Yatay taşma: belge kökü (app-shell'de main kendi kaydırıcısını taşıyabilir; kök en güvenilir ölçü)
  const doc = document.documentElement;
  const scrollWidth = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
  const clientWidth = doc.clientWidth;

  // --- Satırlar: tablo gövde satırları; yoksa DataTable mobil kart listesi (ul.space-y-2 > li)
  let rowEls = Array.from(document.querySelectorAll('tbody tr')).filter(isVisible);
  if (rowEls.length === 0) rowEls = Array.from(document.querySelectorAll('main ul > li, [role="list"] > li')).filter(isVisible);
  const heights = rowEls.map((el) => r1(el.getBoundingClientRect().height)).sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor((heights.length - 1) / 2)]! : 0;
  const rows = { count: heights.length, heights: [heights[0] ?? 0, median, heights[heights.length - 1] ?? 0] as [number, number, number] };

  // --- Font boyutu dağılımı: doğrudan (boş olmayan) metin düğümü taşıyan görünür elemanlar
  const fontSizes: Record<string, number> = {};
  const all = Array.from(document.body.querySelectorAll('*'));
  for (const el of all) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') continue;
    let hasText = false;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim()) { hasText = true; break; }
    }
    if (!hasText || !isVisible(el)) continue;
    const size = String(r1(parseFloat(getComputedStyle(el).fontSize)));
    fontSizes[size] = (fontSizes[size] ?? 0) + 1;
  }

  // --- Dokunma hedefleri (kriter 9): görünür etkileşimli elemanlar, 44px altı
  const interactive = Array.from(
    document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="combobox"], [tabindex]:not([tabindex="-1"])',
    ),
  );
  const seen = new Set<Element>();
  const touchTargetsBelow44: Array<{ selector: string; w: number; h: number }> = [];
  for (const el of interactive) {
    if (seen.has(el) || !isVisible(el)) continue;
    seen.add(el);
    // Sarmalayıcı etkileşimli eleman içindeki iç düğmeler (ör. label>input) — ebeveyn zaten sayılır
    const rect = el.getBoundingClientRect();
    const w = r1(rect.width);
    const h = r1(rect.height);
    if (w < 44 || h < 44) touchTargetsBelow44.push({ selector: shortSelector(el), w, h });
  }

  // --- Renk disiplini (kriter 4): ilk 400 elemanın metin + arka plan renkleri
  const colors = new Set<string>();
  const transparent = /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/;
  for (const el of all.slice(0, 400)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const c = cs.color;
    const bg = cs.backgroundColor;
    if (c && c !== 'transparent' && !transparent.test(c)) colors.add(c);
    if (bg && bg !== 'transparent' && !transparent.test(bg)) colors.add(bg);
  }

  // --- h1 (kriter 1)
  const h1El = Array.from(document.querySelectorAll('h1')).find(isVisible);
  const h1 = h1El
    ? { size: r1(parseFloat(getComputedStyle(h1El).fontSize)), weight: Number(getComputedStyle(h1El).fontWeight) || 400 }
    : null;

  const images = document.querySelectorAll('img').length;

  return {
    scrollWidth,
    clientWidth,
    overflowX: scrollWidth > clientWidth,
    rows,
    fontSizes,
    touchTargetsBelow44,
    distinctColors: colors.size,
    h1,
    images,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const isMobile = opts.viewport.width < 768;
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({
      viewport: opts.viewport,
      deviceScaleFactor: 2,
      isMobile,
      hasTouch: isMobile,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      colorScheme: opts.dark ? 'dark' : 'light',
    });
    const page = await ctx.newPage();
    await openRoute(page, opts);
    // tsx/esbuild `keepNames` ile derlerken iç fonksiyonları `__name(...)` ile sarar; bu yardımcı
    // tarayıcı bağlamında yoktur (ReferenceError: __name is not defined). Fonksiyon kaynak metin
    // olarak gönderilir ve önüne kimlik shim'i eklenir — DOM kodu değişmez.
    const data = (await page.evaluate(`(() => { const __name = (f) => f; return (${collect.toString()})(); })()`)) as Omit<
      Measurement,
      'route' | 'viewport'
    >;
    const result: Measurement = { route: opts.route, viewport: `${opts.viewport.width}x${opts.viewport.height}`, ...data };
    process.stdout.write(JSON.stringify(result) + '\n');
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

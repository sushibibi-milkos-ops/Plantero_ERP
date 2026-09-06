import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const as = process.argv[2] ?? 'admin';
  const w = Number(process.argv[3] ?? 1440);
  const h = Number(process.argv[4] ?? 900);
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 768, hasTouch: w < 768, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/kokpit', as });
  const data = await page.evaluate(`(() => { const __name=(f)=>f; return (${probe.toString()})(); })()`);
  process.stdout.write(JSON.stringify(data, null, 1) + '\n');
  await browser.close();
}

function probe() {
  const r = (n: number) => Math.round(n * 10) / 10;
  const box = (el: Element) => { const b = el.getBoundingClientRect(); return { x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height) }; };
  // Kolon yükseklikleri
  const grids = Array.from(document.querySelectorAll('main .grid')).map((g) => ({
    cls: (g.className || '').slice(0, 80),
    ...box(g),
    children: Array.from(g.children).map((c) => box(c).h),
  }));
  // Bölümler
  const sections = Array.from(document.querySelectorAll('main section')).map((s) => ({
    title: (s.querySelector('h2')?.textContent ?? '').trim(),
    ...box(s),
  }));
  // KPI değerleri: taşma kontrolü
  const kpiVals = Array.from(document.querySelectorAll('main [class*="tabular-nums"]'))
    .filter((el) => (el as HTMLElement).offsetWidth > 0)
    .map((el) => ({
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      cw: (el as HTMLElement).clientWidth,
      sw: (el as HTMLElement).scrollWidth,
      fs: r(parseFloat(getComputedStyle(el).fontSize)),
      clipped: (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1,
    }))
    .filter((x) => x.text);
  // RowLink padding'leri
  const rowLinks = Array.from(document.querySelectorAll('main li > a')).map((a) => {
    const cs = getComputedStyle(a);
    return { text: (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 36), pt: cs.paddingTop, pb: cs.paddingBottom, h: r(a.getBoundingClientRect().height) };
  });
  // main içerik yüksekliği vs viewport
  const main = document.querySelector('main');
  const mainBox = main ? box(main) : null;
  const contentBottom = main ? Math.max(...Array.from(main.querySelectorAll('*')).map((e) => e.getBoundingClientRect().bottom)) : 0;
  // yeşil sayısı
  const greens = new Map<string, number>();
  for (const el of Array.from(document.querySelectorAll('main *'))) {
    const cs = getComputedStyle(el);
    for (const c of [cs.color, cs.backgroundColor]) {
      const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
      if (!m) continue;
      const [R, G, B] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (G > R + 12 && G > B + 12) greens.set(c, (greens.get(c) ?? 0) + 1);
    }
  }
  return { vw: innerWidth, vh: innerHeight, mainBox, contentBottom: r(contentBottom), grids, sections, kpiVals, rowLinks, greens: Array.from(greens.entries()) };
}

main().catch((e) => { console.error(e); process.exit(1); });

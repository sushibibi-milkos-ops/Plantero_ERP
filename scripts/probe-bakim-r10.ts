/** Tur 10: /bakim/oee — mobil KPI şeridi + "Hat bazlı OEE" tablosunun kart içi yatay taşması, çizgi serilerinin stil/renk ayrımı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

(async () => {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // --- mobil
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
    out.mobile = await page.evaluate(() => {
      const res: any = {};
      // KPI şeridi
      const strip = document.querySelector('.scroll-fade-x') as HTMLElement | null;
      if (strip) {
        const kids = Array.from(strip.children) as HTMLElement[];
        const sr = strip.getBoundingClientRect();
        res.kpiStrip = {
          scrollWidth: strip.scrollWidth,
          clientWidth: strip.clientWidth,
          cards: kids.length,
          fullyVisible: kids.filter((k) => k.getBoundingClientRect().right <= sr.right + 0.5).length,
          cardWidths: kids.map((k) => Math.round(k.getBoundingClientRect().width)),
        };
      }
      // kart içi yatay kaydıran her kap
      res.innerScrollers = Array.from(document.querySelectorAll('*'))
        .map((el) => el as HTMLElement)
        .filter((el) => el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 100)
        .map((el) => ({
          tag: el.tagName,
          cls: el.className?.toString().slice(0, 90),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowX: getComputedStyle(el).overflowX,
          text: (el.textContent || '').trim().slice(0, 40),
        }));
      // Hat bazlı OEE tablosu: görünür / kesik sütun sayısı
      const tables = Array.from(document.querySelectorAll('table'));
      res.tables = tables.map((t) => {
        const wrap = t.parentElement as HTMLElement;
        const ths = Array.from(t.querySelectorAll('thead th')).map((th) => (th.textContent || '').trim());
        const wr = wrap.getBoundingClientRect();
        const visible = Array.from(t.querySelectorAll('thead th')).filter((th) => th.getBoundingClientRect().right <= wr.right + 0.5).length;
        return { ths, visible, wrapScrollWidth: wrap.scrollWidth, wrapClientWidth: wrap.clientWidth, wrapOverflowX: getComputedStyle(wrap).overflowX };
      });
      return res;
    });
    await ctx.close();
  }

  // --- masaüstü: çizgi serileri
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
    out.desktop = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('svg .recharts-line-curve, svg path.recharts-curve'));
      const series = paths.map((p) => {
        const cs = getComputedStyle(p as Element);
        return { stroke: cs.stroke, dash: cs.strokeDasharray, width: cs.strokeWidth };
      });
      const legend = Array.from(document.querySelectorAll('.recharts-legend-item, [class*=legend] li, [class*=legend] span')).map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 12);
      // pareto bars
      const bars = Array.from(document.querySelectorAll('.recharts-bar-rectangle path, .recharts-rectangle')).map((b) => getComputedStyle(b as Element).fill);
      // KPI delta satırı
      const deltas = Array.from(document.querySelectorAll('*')).filter((e) => (e.textContent || '').trim() === 'önceki dönem').map((e) => {
        const p = e.parentElement as HTMLElement;
        return { text: (p.textContent || '').trim(), html: p.innerHTML.slice(0, 200) };
      });
      return { series, legend, bars: Array.from(new Set(bars)), barCount: bars.length, deltas };
    });
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
})();

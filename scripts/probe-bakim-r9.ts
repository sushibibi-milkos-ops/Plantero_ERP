/** Tur 9 bakım kritik ölçümleri: mobil kart metin çakışması, sticky footer örtmesi, foto döşeme boyutu, KPI şeridi taşması. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const out: Record<string, unknown> = {};

async function withPage(route: string, w: number, h: number, fn: (p: any) => Promise<unknown>, key: string) {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });
  out[key] = await fn(page);
  await browser.close();
}

(async () => {
  // 1) mobil kart içi metin çifti yatay boşluğu (planlar + makineler)
  for (const [key, route] of [['planlar390', '/bakim/planlar'], ['makineler390', '/bakim/makineler']] as const) {
    await withPage(route, 390, 844, async (page) =>
      page.evaluate(() => {
        const res: any[] = [];
        const cards = Array.from(document.querySelectorAll('ul > li'));
        for (const c of cards.slice(0, 14)) {
          const leaves = Array.from(c.querySelectorAll('*')).filter(
            (e) => e.children.length === 0 && (e.textContent || '').trim().length > 0
          ) as HTMLElement[];
          for (let i = 0; i < leaves.length; i++)
            for (let j = i + 1; j < leaves.length; j++) {
              const a = leaves[i]!.getBoundingClientRect();
              const b = leaves[j]!.getBoundingClientRect();
              const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (vOverlap <= 2) continue;
              const gap = b.left >= a.right ? b.left - a.right : a.left >= b.right ? a.left - b.right : -1;
              if (gap < 8)
                res.push({
                  a: (leaves[i]!.textContent || '').trim().slice(0, 30),
                  b: (leaves[j]!.textContent || '').trim().slice(0, 30),
                  gap: Math.round(gap * 10) / 10,
                });
            }
        }
        return res;
      }), key);
  }

  // 2) yeni: sticky footer, en alta kaydırınca form içeriğini örtüyor mu
  await withPage('/bakim/is-emirleri/yeni', 390, 844, async (page) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /Arızayı bildir/.test(b.textContent || ''));
      const bar = btn?.closest('div')?.parentElement as HTMLElement | undefined;
      const drop = Array.from(document.querySelectorAll('*')).find((e) => /^Ekle$/.test((e.textContent || '').trim()))?.closest('button, label, div[class*="dashed"]') as HTMLElement | undefined;
      const nav = document.querySelector('nav[class*="fixed"], [data-slot="mobile-nav"]') as HTMLElement | null;
      const boxes: Record<string, unknown> = {};
      for (const pair of [['bar', bar], ['drop', drop], ['nav', nav], ['btn', btn]] as any[]) {
        const e = pair[1] as HTMLElement | null | undefined;
        boxes[pair[0]] = e ? { top: Math.round(e.getBoundingClientRect().top), bottom: Math.round(e.getBoundingClientRect().bottom), h: Math.round(e.getBoundingClientRect().height) } : null;
      }
      return { docScroll: document.documentElement.scrollHeight, vh: window.innerHeight, scrollY: Math.round(window.scrollY), ...boxes };
    });
  }, 'yeniStickyBottom');

  // 3) foto döşeme boyutu (iş emri detay @1440)
  await withPage('/bakim/is-emirleri/ba035ca9-d4a3-4985-b584-246976080a7b', 1440, 900, async (page) =>
    page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h2')).find((e) => /FOTOĞRAFLAR/i.test(e.textContent || ''));
      const grid = h?.nextElementSibling as HTMLElement | undefined;
      if (!grid) return null;
      const tiles = Array.from(grid.children) as HTMLElement[];
      return {
        gridCols: getComputedStyle(grid).gridTemplateColumns,
        tiles: tiles.map((t) => ({ w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height) })),
      };
    }), 'photoTiles1440');

  // 4) OEE KPI şeridi @390
  await withPage('/bakim/oee', 390, 844, async (page) =>
    page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('div,section')).filter((e) => e.scrollWidth > e.clientWidth + 4) as HTMLElement[];
      return cands.slice(0, 6).map((e) => ({ cls: e.className.toString().slice(0, 90), sw: e.scrollWidth, cw: e.clientWidth }));
    }), 'oeeOverflow390');

  // 5) satır hover/focus (is-emirleri @1440)
  await withPage('/bakim/is-emirleri', 1440, 900, async (page) =>
    page.evaluate(() => {
      const tr = document.querySelector('tbody tr') as HTMLElement | null;
      if (!tr) return null;
      const cs = getComputedStyle(tr);
      return { h: Math.round(tr.getBoundingClientRect().height), tabindex: tr.getAttribute('tabindex'), cls: tr.className.toString().slice(0, 160), transition: cs.transitionProperty + ' ' + cs.transitionDuration };
    }), 'rowInteraction');

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
})();

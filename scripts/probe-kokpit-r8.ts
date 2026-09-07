import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route: '/kokpit', as: 'admin', base });
  const out = await page.evaluate(() => {
    const res: any = {};
    const pts = [[60, 862], [50, 855], [70, 870], [45, 880]];
    res.hits = pts.map(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { x, y, el: null };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { x, y, tag: el.tagName, cls: (el.getAttribute('class') || '').slice(0, 120), bg: cs.backgroundColor, radius: cs.borderRadius, pos: cs.position, z: cs.zIndex, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], outer: el.outerHTML.slice(0, 200) };
    });
    // find all fixed/absolute elements with dark bg
    const dark: any[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      const m = /rgba?\((\d+), (\d+), (\d+)/.exec(cs.backgroundColor);
      if (!m) continue;
      const lum = Number(m[1]) + Number(m[2]) + Number(m[3]);
      if (lum > 200) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) continue;
      dark.push({ tag: el.tagName, cls: (el.getAttribute('class') || '').slice(0, 100), bg: cs.backgroundColor, pos: cs.position, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], radius: cs.borderRadius });
    }
    res.dark = dark;
    return res;
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main();

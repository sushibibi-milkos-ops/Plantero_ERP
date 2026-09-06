import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route: '/arge/projeler', as: 'admin', base });
  const out = await page.evaluate(() => {
    const res: any = {};
    const els = document.elementsFromPoint(37, 861).map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { tag: e.tagName.toLowerCase(), cls: (e.className && typeof e.className === 'string' ? e.className : '').slice(0, 160), bg: cs.backgroundColor, br: cs.borderRadius, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), pos: cs.position, z: cs.zIndex, op: cs.opacity, text: (e.textContent||'').trim().slice(0,40) };
    });
    res.stack = els;
    // sidebar footer
    const footer = document.querySelector('[data-slot="sidebar-footer"], aside footer, [data-sidebar="footer"]');
    res.footer = footer ? footer.outerHTML.slice(0, 1200) : null;
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main();

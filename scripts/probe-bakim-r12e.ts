import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  const seen: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const inMain = !!e.closest('main');
      return { tag: e.tagName, cls: String(e.className).slice(0, 50), text: (e.innerText ?? '').trim().slice(0, 26).replace(/\n/g,' '), ow: cs.outlineWidth, os: cs.outlineStyle, bs: cs.boxShadow.slice(0, 70), inMain, h: +r.height.toFixed(1) };
    });
    if (info) seen.push(info);
  }
  const noRing = seen.filter((s) => s.inMain && s.ow === '0px' && (!String(s.bs) || String(s.bs) === 'none' || /rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, rgba\(0, 0, 0, 0\))?/.test(String(s.bs))));
  console.log(JSON.stringify({ total: seen.length, noRing, all: seen }, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

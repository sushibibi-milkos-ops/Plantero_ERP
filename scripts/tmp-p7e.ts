import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const as = process.argv[2] ?? 'admin';
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as });
  await page.evaluate(() => (document.querySelector('main') as HTMLElement)?.focus());
  const out: any[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const n = document.activeElement as HTMLElement | null;
      if (!n) return null;
      const inMain = !!n.closest('main');
      const cs = getComputedStyle(n);
      return { t: (n.innerText || n.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 26), inMain, ow: cs.outlineWidth, os: cs.outlineStyle, bs: cs.boxShadow.slice(0, 50), bg: cs.backgroundColor, tag: n.tagName };
    });
    if (s?.inMain) out.push(s);
  }
  const uniq = out.filter((v, i, a) => a.findIndex((x) => x.t === v.t) === i);
  console.log(JSON.stringify(uniq, null, 1));
  await browser.close();
})();

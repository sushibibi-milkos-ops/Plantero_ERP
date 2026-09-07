import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const as = process.argv[2] ?? 'admin';
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as });
  const els = await page.$$('main a[href], main button');
  const out: any[] = [];
  for (const el of els) {
    const t = (await el.innerText()).replace(/\s+/g, ' ').trim().slice(0, 26);
    await el.focus();
    const s = await el.evaluate((n) => {
      const cs = getComputedStyle(n as Element);
      return { outlineW: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 60), bg: cs.backgroundColor };
    });
    out.push({ t, ...s });
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();

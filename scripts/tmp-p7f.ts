import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const as = process.argv[2] ?? 'admin';
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as });
  await page.evaluate(() => (document.querySelector('main') as HTMLElement)?.focus());
  const seen = new Map<string, any>();
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const n = document.activeElement as HTMLElement | null;
      if (!n || !n.closest('main')) return null;
      const cs = getComputedStyle(n);
      const ring = /rgb/.test(cs.boxShadow) && cs.boxShadow !== 'none';
      return { k: (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30) + '|' + n.tagName,
        ua: cs.outlineStyle === 'auto' && cs.outlineWidth !== '0px', appRing: ring, bs: cs.boxShadow.slice(0, 90), sec: (n.closest('section')?.querySelector('h2')?.textContent || 'KPI/şerit') };
    });
    if (s && !seen.has(s.k)) seen.set(s.k, s);
  }
  const arr = [...seen.values()];
  console.log(JSON.stringify({ as, total: arr.length, uaOnly: arr.filter(a => a.ua && !a.appRing).length, appRing: arr.filter(a => a.appRing).length,
    uaList: arr.filter(a => a.ua && !a.appRing).map(a => ({ k: a.k, sec: a.sec })), sample: arr.filter(a=>a.appRing)[0] }, null, 1));
  await browser.close();
})();

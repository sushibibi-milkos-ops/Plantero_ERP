import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const SC = '/tmp/claude-0/-home-user-Plantero-ERP/3810dbed-5b2e-5978-b7d0-6b7c59ef4463/scratchpad';
(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as: 'admin' });
  const shot = async (want: RegExp, name: string) => {
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); document.body.focus(); });
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const n = document.activeElement as HTMLElement | null;
        if (!n || !n.closest('main')) return null;
        const r = n.getBoundingClientRect();
        return { t: (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40), x: r.x, y: r.y, w: r.width, h: r.height };
      });
      if (info && want.test(info.t)) {
        await page.screenshot({ path: `${SC}/${name}.png`, clip: { x: Math.max(0, info.x - 10), y: Math.max(0, info.y - 10), width: Math.min(900, info.w + 20), height: info.h + 20 } });
        console.log(name, JSON.stringify(info));
        return;
      }
    }
    console.log(name, 'NOT FOUND');
  };
  await shot(/Bugünkü net ciro/, 'f-kpi');
  await shot(/^Tümü/, 'f-tumu');
  await shot(/Mal kabul GR-2026-000014/, 'f-row');
  await browser.close();
})();

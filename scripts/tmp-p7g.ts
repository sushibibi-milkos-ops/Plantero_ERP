import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as: 'admin' });
  await page.evaluate(() => (document.querySelector('main') as HTMLElement)?.focus());
  await page.keyboard.press('Tab'); // KPI 1
  await page.screenshot({ path: '/tmp/claude-0/-home-user-Plantero-ERP/3810dbed-5b2e-5978-b7d0-6b7c59ef4463/scratchpad/focus-kpi.png', clip: { x: 320, y: 190, width: 760, height: 130 } });
  for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
  const a = await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.slice(0,40));
  console.log('focused:', a);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-Plantero-ERP/3810dbed-5b2e-5978-b7d0-6b7c59ef4463/scratchpad/focus-row.png', clip: { x: 320, y: 620, width: 760, height: 160 } });
  await browser.close();
})();

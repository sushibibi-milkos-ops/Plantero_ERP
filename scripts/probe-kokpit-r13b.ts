/** Tur 13: odak dili görsel kanıtı — KPI şerit kartı vs RowLink odak halkası. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
const OUT = resolve(process.cwd(), 'artifacts', 'critic');
async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { route: '/kokpit', as: 'admin', base: defaultBaseUrl() });
  const kpi = page.locator('main a').filter({ hasText: 'Bugünkü net ciro' }).first();
  await kpi.focus();
  await page.screenshot({ path: resolve(OUT, 'kokpit-r13-focus-kpi.png'), clip: { x: 320, y: 200, width: 1100, height: 180 } });
  const row = page.locator('main a').filter({ hasText: 'QNB' }).first();
  await row.focus();
  await page.screenshot({ path: resolve(OUT, 'kokpit-r13-focus-row.png'), clip: { x: 1060, y: 340, width: 380, height: 300 } });
  await browser.close();
  console.log('ok');
}
main();

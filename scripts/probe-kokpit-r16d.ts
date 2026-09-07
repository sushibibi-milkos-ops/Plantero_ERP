/** Tur 16: KPI şerit kartı odak kanıtı (kokpit-focus-ring-dialect-10) + satır odağı karşılaştırması. */
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route: '/kokpit', as: 'admin', base: defaultBaseUrl() });
  const kpi = page.locator('main a').filter({ hasText: 'Kritik stok kalemi' }).first();
  await kpi.focus();
  await page.screenshot({ path: resolve(process.cwd(), 'artifacts/critic/kokpit-r16-focus-kpi.png'), clip: { x: 660, y: 160, width: 700, height: 130 }, animations: 'disabled' });
  const row = page.locator('main a').filter({ hasText: 'Tümü' }).first();
  await row.focus();
  await page.screenshot({ path: resolve(process.cwd(), 'artifacts/critic/kokpit-r16-focus-row.png'), clip: { x: 330, y: 340, width: 760, height: 120 }, animations: 'disabled' });
  await browser.close();
  console.log('ok');
}
main();

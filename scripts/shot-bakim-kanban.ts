import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/is-emirleri', base, as: 'admin' });
  await page.getByRole('button', { name: 'Kanban görünümü' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/screens/bakim-is-emirleri/kanban.png', fullPage: true });
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

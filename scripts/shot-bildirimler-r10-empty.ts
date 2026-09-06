import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route: '/bildirimler', as: 'admin', base: defaultBaseUrl(), dark: false });
  await page.screenshot({ path: 'artifacts/critic/bildirimler-admin-empty-r10.png', animations: 'disabled' });
  await browser.close();
  console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });

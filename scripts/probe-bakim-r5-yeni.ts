/** Tur 5 doğrulama — /bakim/is-emirleri/yeni: h1 sol kenar hizası diğer bakım route'larıyla (264px) eşleşiyor mu (bakim-yeni-03). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
  const res = await page.evaluate(() => {
    const h1 = document.querySelector('main h1');
    return h1 ? Math.round(h1.getBoundingClientRect().left) : null;
  });
  console.log(JSON.stringify({ route: '/bakim/is-emirleri/yeni', h1Left: res }));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

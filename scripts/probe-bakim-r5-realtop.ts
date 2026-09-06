import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
  const res = await page.evaluate(() => {
    const card = document.querySelector('main .grid.grid-cols-1.gap-4 > div');
    return card ? Math.round(card.getBoundingClientRect().top) : null;
  });
  console.log(JSON.stringify({ chartCardTop: res }));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

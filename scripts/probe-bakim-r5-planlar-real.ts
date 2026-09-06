import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/planlar', base, as: 'admin' });
  const res = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Tabloda ara"]');
    const rows = Array.from(document.querySelectorAll('main tbody tr'));
    return {
      toolbarTop: input ? Math.round(input.getBoundingClientRect().top) : null,
      rowCount: rows.length,
      firstRowTop: rows[0] ? Math.round(rows[0].getBoundingClientRect().top) : null,
    };
  });
  console.log(JSON.stringify(res));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

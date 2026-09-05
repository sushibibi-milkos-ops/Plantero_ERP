/** Derin bağlantı (?lot=) çözülene kadar geçen süre + o anda ekranda ne yazdığı. */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const route = process.argv.slice(2).find((a) => a.startsWith('/')) ?? '/kalite/izlenebilirlik?lot=PL-260808-H1-12';
  const vpArg = process.argv.includes('--viewport') ? process.argv[process.argv.indexOf('--viewport') + 1]! : '1440x900';
  const [w, h] = vpArg.split('x').map(Number) as [number, number];
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });
  const t0 = Date.now();
  const atSettle = await page.evaluate(() => ({
    text: (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
    busy: document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length,
  }));
  let ms = -1;
  try {
    await page.waitForSelector('text=Miktar dengesi', { timeout: 30000 });
    ms = Date.now() - t0;
  } catch { /* yok */ }
  const after = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200));
  console.log(JSON.stringify({ route, viewport: vpArg, atSettle, extraMsUntilGraph: ms, after }));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

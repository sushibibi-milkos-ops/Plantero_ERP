/** Tur 5 doğrulama — /bakim/oee trend grafiği: üç bileşen serisinin stroke rengi artık farklı mı (bakim-oee-06). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
  const res = await page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll<SVGPathElement>('main .recharts-area-curve'));
    return paths.map((p) => ({ stroke: getComputedStyle(p).stroke, dasharray: p.getAttribute('stroke-dasharray') }));
  });
  console.log(JSON.stringify(res, null, 1));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

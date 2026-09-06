/** Tur 4 doğrulama — 390x844'te /bakim/is-emirleri/[id] içindeki tüm gerçek bağlantıların kutu
 * boyutunu listeler (bakim-isemirleri-detay-09: makine linki 44x44'ün altında kalmamalı). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const collect = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('main a[href]')).map((el) => {
  const r = el.getBoundingClientRect();
  return { href: el.getAttribute('href'), t: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,50), w: Math.round(r.width*10)/10, h: Math.round(r.height*10)/10 };
});
async function main() {
  const route = process.argv[2]!;
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route, as: 'admin', base });
  console.log(JSON.stringify(await page.evaluate(collect), null, 1));
  await ctx.close(); await browser.close();
}
main();

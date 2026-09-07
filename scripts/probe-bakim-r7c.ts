/** Tur 7 — /bakim/is-emirleri/yeni @390 kaydırma sonu ölü alan + sticky çubuk konumu. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var main = document.querySelector('main') || document.body;
  var lastBottom = 0;
  var all = Array.prototype.slice.call(main.querySelectorAll('*'));
  for (var i = 0; i < all.length; i++) {
    var el = all[i]; var r = el.getBoundingClientRect();
    var st = getComputedStyle(el);
    if (st.position === 'fixed' || st.position === 'sticky') continue;
    if (r.height > 0 && r.width > 0 && r.bottom > lastBottom) lastBottom = r.bottom;
  }
  var bar = document.querySelector('[class*="sticky"][class*="bottom-16"]');
  var barRect = bar ? bar.getBoundingClientRect() : null;
  var nav = document.querySelector('nav[class*="fixed"], [class*="fixed"][class*="bottom-0"]');
  var navRect = nav ? nav.getBoundingClientRect() : null;
  return {
    scrollY: Math.round(window.scrollY),
    maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    docH: Math.round(document.documentElement.scrollHeight),
    vh: window.innerHeight,
    lastContentBottom: Math.round(lastBottom),
    deadTail: Math.round(window.innerHeight - lastBottom),
    bar: barRect ? { top: Math.round(barRect.top), bottom: Math.round(barRect.bottom), h: Math.round(barRect.height) } : null,
    nav: navRect ? { top: Math.round(navRect.top), bottom: Math.round(navRect.bottom) } : null
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
  console.log('top   ', JSON.stringify(await page.evaluate(COLLECT)));
  await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await page.waitForTimeout(400);
  console.log('bottom', JSON.stringify(await page.evaluate(COLLECT)));
  await page.screenshot({ path: 'artifacts/critic/bakim-r7-yeni-390-bottom.png' });
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

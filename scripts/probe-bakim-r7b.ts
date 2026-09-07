/** Tur 7 — /bakim/is-emirleri/yeni @390 yatay taşmanın kaynağı + iş emri fotoğraf kutusu. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var main = document.querySelector('main') || document.body;
  var host = main.querySelector('form') || main;
  var hostRect = host.getBoundingClientRect();
  var over = [];
  var all = Array.prototype.slice.call(main.querySelectorAll('*'));
  for (var i = 0; i < all.length; i++) {
    var el = all[i]; var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > hostRect.right + 0.5 || r.left < hostRect.left - 0.5) {
      var t = el.tagName.toLowerCase();
      var c = (typeof el.className === 'string' ? el.className : '').slice(0, 90);
      over.push({ tag: t, cls: c, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), txt: (el.textContent || '').trim().slice(0, 30) });
    }
  }
  return { hostLeft: Math.round(hostRect.left), hostRight: Math.round(hostRect.right), innerW: window.innerWidth, over: over.slice(0, 14) };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await context.newPage();
    await openRoute(page, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
    console.log(JSON.stringify({ vp: `${vp.width}x${vp.height}`, ...(await page.evaluate(COLLECT) as object) }, null, 1));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

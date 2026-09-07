/**
 * Tur 7 düzeltme doğrulaması — bakim-isemirleri-06 (P1).
 * /bakim/is-emirleri/[id] "Fotoğraflar" kartında yer tutucu fotoğrafın artık object-cover'lı
 * <img> ile büyütülmediğini, bunun yerine nötr bir simge döşemesi gösterildiğini doğrular.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var main = document.querySelector('main') || document.body;
  var tiles = Array.prototype.slice.call(main.querySelectorAll('.aspect-square'));
  var out = tiles.map(function (t) {
    var img = t.querySelector('img');
    var rect = t.getBoundingClientRect();
    var placeholderEl = t.querySelector('svg');
    var label = t.querySelector('span');
    return {
      w: Math.round(rect.width), h: Math.round(rect.height),
      hasImg: !!img,
      imgNaturalW: img ? img.naturalWidth : null,
      imgNaturalH: img ? img.naturalHeight : null,
      hasPlaceholderIcon: !!placeholderEl,
      labelText: label ? label.textContent : null,
      bg: getComputedStyle(t).backgroundColor,
    };
  });
  return { tileCount: tiles.length, tiles: out };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const wo = process.argv[2] || '8ac32a70-5fc6-4c22-a620-ebd2df1c2efc';
  const targets = [
    { route: `/bakim/is-emirleri/${wo}`, vp: { width: 1440, height: 900 } },
    { route: `/bakim/is-emirleri/${wo}`, vp: { width: 390, height: 844 } },
  ];
  const browser = await launchBrowser();
  for (const t of targets) {
    const context = await browser.newContext({ viewport: t.vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await context.newPage();
    await openRoute(page, { route: t.route, base, as: 'admin' });
    await page.waitForTimeout(300); // onLoad state güncellemesi için
    const res = await page.evaluate(COLLECT);
    console.log(JSON.stringify({ route: t.route, vp: `${t.vp.width}x${t.vp.height}`, ...(res as object) }));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

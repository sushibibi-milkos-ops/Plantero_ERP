/** Tur 5 doğrulama — /bakim/is-emirleri/yeni 1. adım emptyBelow (bakim-yeni-02). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const main = document.querySelector('main');
  const vh = window.innerHeight;
  let lastBottom = 0;
  if (main) for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0 && r.bottom > lastBottom && r.bottom < 100000) lastBottom = r.bottom;
  }
  return { lastContentBottom: Math.round(lastBottom), viewportHeight: vh, emptyBelow: Math.round(vh - lastBottom) };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
  const res = await page.evaluate(collect);
  console.log(JSON.stringify({ route: '/bakim/is-emirleri/yeni', vp: '1440x900', ...res }));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

/** Tur 5 doğrulama — /bakim/oee: emptyBelow (bakim-oee-02), chip basılı geri bildirimi (bakim-oee-03). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const main = document.querySelector('main');
  const vh = window.innerHeight;
  let lastBottom = 0;
  if (main) for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0 && r.bottom > lastBottom && r.bottom < 100000) lastBottom = r.bottom;
  }
  const chip = document.querySelector('main a[data-pressable]');
  return {
    lastContentBottom: Math.round(lastBottom), viewportHeight: vh, emptyBelow: Math.round(vh - lastBottom),
    chipHasDataPressable: Boolean(chip),
  };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
  const res = await page.evaluate(collect);
  console.log(JSON.stringify({ route: '/bakim/oee', vp: '1440x900', ...res }));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

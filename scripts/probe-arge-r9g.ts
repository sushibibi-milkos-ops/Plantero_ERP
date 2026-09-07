/**
 * Tur 9g — odak halkasının GÖRSEL doğrulaması: butona klavyeyle odaklan, kırpılmış ekran görüntüsü al.
 * Çıktı: artifacts/critic/arge-r9-focus-*.png
 */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();
const PID = process.env.PID ?? 'c2913daa-05c6-46bc-9f48-942e864a651f';

async function run() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  const page = await ctx.newPage();

  const shot = async (route: string, text: string, name: string) => {
    await openRoute(page, { base, route, as: 'admin' });
    await page.evaluate((t) => {
      document.querySelectorAll('[data-p]').forEach((e) => e.removeAttribute('data-p'));
      const el = (Array.from(document.querySelectorAll('button, a[data-slot="button"]')) as HTMLElement[]).find((e) =>
        (e.textContent ?? '').includes(t),
      );
      el?.setAttribute('data-p', 'target');
    }, text);
    await page.locator('[data-p="target"]').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const box = await page.locator('[data-p="target"]').boundingBox();
    if (!box) return;
    await page.screenshot({
      path: `artifacts/critic/${name}.png`,
      clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.width + 40, height: box.height + 40 },
      animations: 'disabled',
    });
    const cs = await page.evaluate(() => {
      const e = document.querySelector('[data-p="target"]') as HTMLElement;
      const s = getComputedStyle(e);
      return { fv: e.matches(':focus-visible'), outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, ring: s.boxShadow };
    });
    console.log(name, JSON.stringify(cs));
  };

  await shot('/arge/projeler', 'Yeni proje', 'arge-r9-focus-yeniproje');
  await shot(`/arge/projeler/${PID}/receteler`, 'Onaya gönder', 'arge-r9-focus-onaya');
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

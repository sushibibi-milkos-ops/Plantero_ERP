/** Tur 12: her Tab adımında ayrı ekran görüntüsü — odak halkası gerçekten görünüyor mu? */
import { mkdirSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  mkdirSync('artifacts/critic/r12-focus', { recursive: true });
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['yeni', '/ihracat/sevkiyatlar/yeni']] as Array<[string, string]>) {
    await openRoute(page, { base: BASE, route, as: 'admin' });
    await page.locator('main').click({ position: { x: 4, y: 4 } });
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      const box = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, label: (el.textContent ?? el.getAttribute('placeholder') ?? '').trim().slice(0, 20) };
      });
      if (!box) continue;
      await page.screenshot({
        path: `artifacts/critic/r12-focus/${k}-${i}.png`,
        clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: Math.min(600, box.w + 32), height: Math.min(200, box.h + 32) },
        animations: 'disabled',
      });
    }
  }
  await ctx.close();
  await browser.close();
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });

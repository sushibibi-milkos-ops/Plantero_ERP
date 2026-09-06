import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
import { mkdirSync } from 'node:fs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  mkdirSync('artifacts/critic', { recursive: true });
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await openRoute(page, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
    await page.locator('input[placeholder*="QR"]').fill('MCH:MK-008');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=Başlık', { timeout: 30000 });
    await page.locator('input[type=file]').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: PNG },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/critic/bakim-yeni-step2-${vp.width}.png`, fullPage: true });
    const res = await page.evaluate(() => {
      const small: any[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('main button, main input, main a[href], main [role="button"], main [role="combobox"]'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 44 || r.height < 44) small.push({ sel: el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''), t: (el.textContent||'').trim().slice(0,20), w: Math.round(r.width), h: Math.round(r.height) });
      }
      const doc = document.documentElement;
      return { small, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    console.log(JSON.stringify({ vp: `${vp.width}x${vp.height}`, ...res }));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

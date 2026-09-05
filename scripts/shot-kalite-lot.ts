/** Geçici: ?lot= derin bağlantısı çözülene kadar bekleyip çekim (gorsel-critic tur 3). */
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const route = '/kalite/izlenebilirlik?lot=PL-260902-H1-01';
  const base = defaultBaseUrl();
  const outDir = resolve(process.cwd(), 'artifacts', 'screens', 'kalite-izlenebilirlik-lot');
  mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  for (const [kind, vp] of Object.entries({ desktop: { width: 1440, height: 900, mobile: false }, mobile: { width: 390, height: 844, mobile: true } })) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    await page.waitForSelector('text=Miktar dengesi', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(outDir, `${kind}.png`), fullPage: true, animations: 'disabled' });
    console.log('✓', kind, join(outDir, `${kind}.png`));
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

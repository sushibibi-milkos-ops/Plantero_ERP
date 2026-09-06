import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const IDS: Array<[string, string]> = [
  ['kapali', '6224ef76-6704-4b62-9bf3-727d67e44180'],
  ['taslak', 'fce0b6c8-5ba5-4456-a640-8b2301bec4f2'],
];
async function main() {
  const browser = await launchBrowser();
  const dir = resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-r6-durumlar');
  mkdirSync(dir, { recursive: true });
  for (const [name, id] of IDS) {
    for (const [kind, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${id}`, as: 'admin' });
      await page.screenshot({ path: resolve(dir, `${name}-${kind}.png`), fullPage: true, animations: 'disabled' });
      if (kind === 'desktop') {
        const t = page.getByRole('tab', { name: 'Fatura & kur' });
        if (await t.count()) { await t.first().click(); await page.waitForTimeout(400); await page.screenshot({ path: resolve(dir, `${name}-desktop-fatura.png`), fullPage: true, animations: 'disabled' }); }
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log('ok', dir);
}
main().catch((e) => { console.error(e); process.exit(1); });

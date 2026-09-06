/**
 * Tur 2 doğrulama ekran görüntüleri — sevkiyat detayının Belgeler/Çeki listesi sekmeleri (varsayılan
 * sekme değil, `pnpm shot` tab tıklamaz). Kullanım: pnpm tsx scripts/shot-ihracat-r3-tabs.ts <shipmentId>
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = process.argv[2];
if (!SHIP) throw new Error('kullanım: tsx scripts/shot-ihracat-r3-tabs.ts <shipmentId>');

async function main() {
  const browser = await launchBrowser();
  const dir = resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-sevkiyat-detay-sekmeler-r3');
  mkdirSync(dir, { recursive: true });

  for (const [kind, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    for (const tab of ['Belgeler', 'Çeki listesi']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(400);
      const slug = tab.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await page.screenshot({ path: resolve(dir, `${kind}-${slug}.png`), fullPage: true, animations: 'disabled' });
    }
    await ctx.close();
  }
  await browser.close();
  console.log('ok', dir);
}

main().catch((e) => { console.error(e); process.exit(1); });

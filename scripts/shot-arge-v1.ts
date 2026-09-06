/** Geçici: v1 (draft, editable) versiyonunu tıklayıp ekran görüntüsü alır — CLI'dan doğrudan
 * erişilemeyen istemci durumunu (seçili versiyon) doğrulamak için. */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();
const PROJECT_ID = process.argv[2] ?? 'da3fd290-e3db-4d92-b5f9-3297ba43268a';
const route = `/arge/projeler/${PROJECT_ID}/receteler`;

async function shot(viewport: { width: number; height: number }, name: string) {
  const isMobile = viewport.width < 768;
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch: isMobile, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'arge' });
    await page.getByText('v1', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/screens/arge-recete-v1-${name}.png`, fullPage: true });
    await ctx.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  await shot({ width: 1440, height: 900 }, 'desktop');
  await shot({ width: 390, height: 844 }, 'mobile');
}

main().catch((e) => { console.error(e); process.exit(1); });

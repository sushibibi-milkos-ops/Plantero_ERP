import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const outDir = resolve(process.cwd(), 'artifacts', 'screens', 'arge-card-drawer');
  mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/projeler/349115b7-72d7-4679-991b-c5b2844660f5/board', as: 'arge' });
    await page.getByText('v2: hurma şurubu azaltma denemesi').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(outDir, 'desktop.png'), animations: 'disabled' });
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

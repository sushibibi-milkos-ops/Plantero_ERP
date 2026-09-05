/** Tur 7 — boş durum görüntüleri (ayrı klasör, ana ekran görüntülerini ezmez). */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
const base = defaultBaseUrl();
async function shot(route: string, as: string, w: number, h: number, file: string) {
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route, as, base, dark: false });
    await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
    await ctx.close();
  } finally { await browser.close(); }
}
async function main() {
  const dir = resolve(process.cwd(), 'artifacts/screens/_bildirimler-r7-empty');
  mkdirSync(dir, { recursive: true });
  await shot('/bildirimler', 'admin', 1440, 900, resolve(dir, 'bildirimler-empty-desktop.png'));
  await shot('/onaylar', 'kalite', 1440, 900, resolve(dir, 'onaylar-empty-desktop.png'));
  console.log('ok');
}
void main();

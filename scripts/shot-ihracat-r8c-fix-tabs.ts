/** Tur 8 düzeltme doğrulaması: ihracat-detay-19 (P1) — Belgeler sekmesi + kurlar ekran görüntüsü. */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = execSync(`psql "${process.env.DATABASE_URL}" -t -A -c "select id from export_shipments where doc_no = 'EXP-2026-000002';"`, { encoding: 'utf8' }).trim();

async function main() {
  const browser = await launchBrowser();
  const dir = resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-r8c-fix-tabs');
  mkdirSync(dir, { recursive: true });
  for (const [kind, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    const t = page.getByRole('tab', { name: 'Belgeler' });
    if (await t.count()) { await t.first().click(); await page.waitForTimeout(500); }
    await page.screenshot({ path: resolve(dir, `documents-${kind}.png`), fullPage: true, animations: 'disabled' });
    await ctx.close();
  }
  for (const [kind, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
    await page.screenshot({ path: resolve(dir, `kurlar-${kind}.png`), fullPage: true, animations: 'disabled' });
    await ctx.close();
  }
  await browser.close();
  console.log('ok', dir, SHIP);
}
main().catch((e) => { console.error(e); process.exit(1); });

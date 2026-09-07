/** Tur 8: sevkiyat detayının tüm sekmeleri (masaüstü + mobil). */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = execSync(`psql "postgres://postgres:postgres@localhost:5432/plantero" -t -A -c "select id from export_shipments where doc_no = 'EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
const TABS: Array<[string, string]> = [
  ['Sipariş satırları', 'lines'],
  ['Çeki listesi', 'packing'],
  ['Belgeler', 'documents'],
  ['Fatura & kur', 'invoice'],
];

async function main() {
  const browser = await launchBrowser();
  const dir = resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-r8c-tabs');
  mkdirSync(dir, { recursive: true });
  for (const [kind, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    for (const [name, slug] of TABS) {
      const t = page.getByRole('tab', { name });
      if (await t.count()) { await t.first().click(); await page.waitForTimeout(500); }
      await page.screenshot({ path: resolve(dir, `${slug}-${kind}.png`), fullPage: true, animations: 'disabled' });
    }
    await ctx.close();
  }
  await browser.close();
  console.log('ok', dir, SHIP);
}
main().catch((e) => { console.error(e); process.exit(1); });

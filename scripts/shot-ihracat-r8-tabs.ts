/** Tur 7 düzeltme doğrulaması: sevkiyat detayının Belgeler/Sipariş satırları/Çeki listesi sekmeleri. */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
function resolveShipmentId(): string {
  const out = execSync(`psql "${process.env.DATABASE_URL}" -t -A -c "select id from export_shipments where doc_no = 'EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
  if (!out) throw new Error('EXP-2026-000002 bulunamadı');
  return out;
}
const SHIP = resolveShipmentId();
const TABS = ['Sipariş satırları', 'Belgeler', 'Çeki listesi'];

async function main() {
  const browser = await launchBrowser();
  const dir = resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-r8-tabs');
  mkdirSync(dir, { recursive: true });
  for (const [kind, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    for (const tabName of TABS) {
      const t = page.getByRole('tab', { name: tabName });
      if (await t.count()) { await t.first().click(); await page.waitForTimeout(400); }
      const slug = tabName.toLowerCase().replace(/ı/g, 'i').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/[^a-z0-9]+/g, '-');
      await page.screenshot({ path: resolve(dir, `${slug}-${kind}.png`), fullPage: true, animations: 'disabled' });
    }
    await ctx.close();
  }
  await browser.close();
  console.log('ok', dir);
}
main().catch((e) => { console.error(e); process.exit(1); });

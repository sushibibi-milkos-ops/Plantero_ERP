/** Tur 15: sevkiyat detayının 4 sekmesi (masaüstü + mobil) + kapalı sevkiyat + boş/odak durumları. */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();
const OUT = 'artifacts/screens/ihracat-r15-tabs';

const TABS: Array<[string, string]> = [['Sipariş satırları', 'satirlar'], ['Çeki listesi', 'ceki'], ['Belgeler', 'belgeler'], ['Fatura & kur', 'fatura']];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser();
  const SHIP = id('EXP-2026-000002');
  const CLOSED = id('EXP-2026-000001');
  const DRAFT = id('EXP-2026-000003');

  for (const [vp, w, h] of [['1440', 1440, 900], ['390', 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w === 390, hasTouch: w === 390, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    for (const [name, slug] of TABS) {
      const tab = page.getByRole('tab', { name }).first();
      await tab.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/detay-${slug}-${vp}.png`, fullPage: true, animations: 'disabled' });
    }
    await ctx.close();
  }

  // kapalı + taslak sevkiyat (masaüstü, belgeler sekmesi)
  for (const [label, sid] of [['kapali', CLOSED], ['taslak', DRAFT]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${sid}`, as: 'admin' });
    await p.screenshot({ path: `${OUT}/${label}-ozet-1440.png`, fullPage: true, animations: 'disabled' });
    await p.getByRole('tab', { name: 'Belgeler' }).first().click();
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/${label}-belgeler-1440.png`, fullPage: true, animations: 'disabled' });
    await ctx.close();
  }

  // 1024x768 operatör görünümü (liste)
  const ctx3 = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p3 = await ctx3.newPage();
  await openRoute(p3, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  await p3.screenshot({ path: `${OUT}/liste-1024.png`, fullPage: true, animations: 'disabled' });
  await ctx3.close();

  await browser.close();
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });

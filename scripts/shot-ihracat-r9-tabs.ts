/** Tur 9: sevkiyat detayının 4 sekmesi (masaüstü) + boş arama sonucu + odak halkası. */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const SHIP = execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
const OUT = 'artifacts/screens/ihracat-r9-tabs';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
  const map: Array<[string, string]> = [['Çeki listesi', 'ceki'], ['Belgeler', 'belgeler'], ['Fatura & kur', 'fatura']];
  for (const [name, slug] of map) {
    await page.getByRole('tab', { name }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/detay-${slug}.png`, fullPage: true, animations: 'disabled' });
  }
  await ctx.close();

  // Boş arama sonucu + hover + odak (belgeler panosu)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p2 = await ctx2.newPage();
  await openRoute(p2, { base: BASE, route: '/ihracat/belgeler', as: 'admin' });
  const search = p2.locator('input[placeholder*="ara"]').first();
  await search.fill('zzzzzz');
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: `${OUT}/belgeler-bos-sonuc.png`, fullPage: false, animations: 'disabled' });
  await search.fill('');
  await p2.waitForTimeout(500);
  // odak halkası: Tab ile ilk satır eylemine geç
  const focus = await p2.evaluate(() => {
    const btn = document.querySelector('table tbody tr button') as HTMLElement | null;
    if (!btn) return null;
    btn.focus();
    const cs = getComputedStyle(btn);
    return { outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, boxShadow: cs.boxShadow, ring: cs.getPropertyValue('--tw-ring-color') };
  });
  const rowHover = await p2.evaluate(async () => {
    const tr = document.querySelector('table tbody tr') as HTMLElement | null;
    if (!tr) return null;
    const before = getComputedStyle(tr).backgroundColor;
    return { before };
  });
  const tr = p2.locator('table tbody tr').first();
  await tr.hover();
  await p2.waitForTimeout(250);
  const after = await p2.evaluate(() => getComputedStyle(document.querySelector('table tbody tr') as HTMLElement).backgroundColor);
  await p2.screenshot({ path: `${OUT}/belgeler-hover.png`, fullPage: false, animations: 'disabled' });
  console.error(JSON.stringify({ focus, rowHover, hoverAfter: after }));
  await ctx2.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

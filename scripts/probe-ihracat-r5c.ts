/** Tur 5: diyaloglar (gümrük güncelle, lojistik düzenle, belge düzenle) + GTİP select açık hâli. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = process.argv[2]!;
const dir = resolve(process.cwd(), 'artifacts', 'critic');

async function main() {
  const browser = await launchBrowser();
  mkdirSync(dir, { recursive: true });
  const out: Record<string, unknown> = {};

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });

  await page.getByRole('button', { name: 'Gümrük bilgisini güncelle' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(dir, 'ihracat-r5-gumruk-dialog-1440.png'), animations: 'disabled' });
  out.customsDialog = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!d) return { err: 'diyalog yok' };
    const r = d.getBoundingClientRect();
    const fields = [...d.querySelectorAll('input,select,button[data-slot="select-trigger"]')].map((e) => { const b = e.getBoundingClientRect(); return { tag: e.tagName, id: (e as HTMLElement).id, w: Math.round(b.width), h: Math.round(b.height) }; });
    return { w: Math.round(r.width), h: Math.round(r.height), fields, text: (d.innerText || '').split('\n').slice(0, 14) };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Düzenle' }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(dir, 'ihracat-r5-lojistik-dialog-1440.png'), animations: 'disabled' });
  out.logisticsDialog = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!d) return { err: 'diyalog yok' };
    const r = d.getBoundingClientRect();
    const fields = [...d.querySelectorAll('input,button[data-slot="select-trigger"]')].map((e) => { const b = e.getBoundingClientRect(); return { id: (e as HTMLElement).id, w: Math.round(b.width), h: Math.round(b.height) }; });
    return { w: Math.round(r.width), h: Math.round(r.height), fieldCount: fields.length, fields: fields.slice(0, 12), overflowY: d.scrollHeight > d.clientHeight ? [d.scrollHeight, d.clientHeight] : null };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // GTİP select açık hâli
  await openRoute(page, { base: BASE, route: '/ihracat/gtip', as: 'admin' });
  await page.locator('button[data-slot="select-trigger"]').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(dir, 'ihracat-r5-gtip-select-1440.png'), animations: 'disabled' });
  out.gtipSelect = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[role="option"]')].map((o) => ({ t: (o.textContent || '').trim(), h: Math.round(o.getBoundingClientRect().height) }));
    return { count: opts.length, opts };
  });

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

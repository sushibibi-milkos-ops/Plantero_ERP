/** Tur 14: odak halkasının tam ölçümü (boxShadow tam metin + :focus-visible eşleşmesi) + ekran görüntüsü. */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();
const OUT = 'artifacts/screens/ihracat-r14-states';
async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser();
  const res: any = {};
  const SHIP = id('EXP-2026-000002');
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['kurlar', '/ihracat/kurlar'], ['yeni', '/ihracat/sevkiyatlar/yeni'], ['detay', `/ihracat/sevkiyatlar/${SHIP}`]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    await page.evaluate(() => { const m = document.querySelector('main') as HTMLElement; m.setAttribute('tabindex', '-1'); m.focus(); });
    const out: any[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      out.push(await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, txt: (el.textContent ?? '').trim().slice(0, 22), fv: el.matches(':focus-visible'), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} off:${cs.outlineOffset}`, boxShadow: cs.boxShadow, border: `${cs.borderTopWidth} ${cs.borderTopColor}` };
      }));
      await page.screenshot({ path: `${OUT}/focus-${k}-${i}.png`, animations: 'disabled' });
    }
    res[k] = out;
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r14c.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });

/** Tur 15c: zincir kartlarının ham DOM sırası (etiket metni + soldan konum). */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  const res: Record<string, unknown> = {};
  for (const no of ['EXP-2026-000001', 'EXP-2026-000002']) {
    await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${id(no)}`, as: 'admin' });
    res[no] = await p.evaluate(() => Array.from(document.querySelectorAll('a[data-pressable], [data-slot]')).filter((e) => (e as HTMLElement).className?.toString().includes('snap-start')).map((a) => ({
      x: Math.round(a.getBoundingClientRect().left),
      label: (a.querySelector('span')?.textContent ?? '').trim(),
      docNo: ((a.textContent ?? '').match(/(SO|DN|INV|EXP|QT|GR)-\d{4}-\d{6}/) ?? ['—'])[0],
      tag: a.tagName,
    })).sort((a, b) => a.x - b.x));
  }
  writeFileSync('artifacts/critic/probe-ihracat-r15c.json', JSON.stringify(res, null, 2));
  await ctx.close(); await browser.close();
  console.error(JSON.stringify(res));
}
main().catch((e) => { console.error(e); process.exit(1); });

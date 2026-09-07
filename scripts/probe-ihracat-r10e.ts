/** Tur 10e: detay sekmelerinde mobil kart yükseklikleri + tablo başlık hizası. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const SHIP = execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
const CLOSED = execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='EXP-2026-000001';"`, { encoding: 'utf8' }).trim();
async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  for (const [k, sid] of [['gumrukte', SHIP], ['kapali', CLOSED]] as Array<[string, string]>) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${sid}`, as: 'admin' });
    const per: any = {};
    for (const name of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
      await p.getByRole('tab', { name }).first().click();
      await p.waitForTimeout(400);
      per[name] = await p.evaluate(() => {
        const li = Array.from(document.querySelectorAll('[role="tabpanel"] ul > li')).map((e) => Math.round(e.getBoundingClientRect().height));
        const de = document.documentElement;
        return { heights: li, distinct: Array.from(new Set(li)).sort((a, b) => a - b), scrollW: de.scrollWidth, clientW: de.clientWidth };
      });
    }
    res[k] = per;
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r10e.json', JSON.stringify(res, null, 1));
  console.error(JSON.stringify(res));
}
main().catch((e) => { console.error(e); process.exit(1); });

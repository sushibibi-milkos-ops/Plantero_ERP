/** Tur 11: 390px sevkiyat detayında "Bağlı irsaliye" satırındaki bağlantının dokunma hedefi. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();
async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  for (const no of ['EXP-2026-000002', 'EXP-2026-000001']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${id(no)}`, as: 'admin' });
    const link = page.locator('main a.font-mono').last();
    const n = await link.count();
    if (!n) { res[no] = { found: 0 }; await ctx.close(); continue; }
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await link.boundingBox();
    const parent = await link.evaluate((el) => { const p = el.parentElement!.getBoundingClientRect(); const cs = getComputedStyle(el); return { parentH: Math.round(p.height), parentW: Math.round(p.width), pad: `${cs.paddingTop}/${cs.paddingBottom}`, minH: cs.minHeight, display: cs.display, href: (el as HTMLAnchorElement).getAttribute('href') }; });
    res[no] = { w: Math.round(box!.width), h: Math.round(box!.height), ...parent };
    await page.screenshot({ path: `artifacts/critic/ihracat-r11-dnlink-${no}.png`, clip: { x: 0, y: Math.max(0, box!.y - 40), width: 390, height: 120 } });
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r11f.json', JSON.stringify(res, null, 1));
  console.error(JSON.stringify(res, null, 1));
}
main().catch((e)=>{console.error(e);process.exit(1);});

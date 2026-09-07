import { execSync } from 'node:child_process';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
function resolveShipmentId(): string {
  const out = execSync(`psql "${process.env.DATABASE_URL}" -t -A -c "select id from export_shipments where doc_no = 'EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
  return out;
}
const SHIP = resolveShipmentId();

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
  const tab = page.getByRole('tab', { name: 'Belgeler' });
  await tab.first().click();
  await page.waitForTimeout(500);
  const diag = await page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]:not([hidden])') as HTMLElement | null;
    const tb = panel?.querySelector('table') as HTMLElement | null;
    if (!tb) return null;
    const cs = getComputedStyle(tb);
    const ths = Array.from(tb.querySelectorAll('thead th'));
    const thInfo = ths.map((th) => ({
      text: (th.textContent ?? '').trim(),
      inlineStyleWidth: (th as HTMLElement).style.width,
      inlineStyleMinWidth: (th as HTMLElement).style.minWidth,
      computedWidth: getComputedStyle(th).width,
    }));
    return { tableLayout: cs.tableLayout, tableWidth: cs.width, thInfo };
  });
  console.log(JSON.stringify(diag, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

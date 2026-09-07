/** Tur 7 fix doğrulama: 1440x900 + 390x844'te yatay taşma (scrollWidth<=clientWidth) taraması. */
import { execSync } from 'node:child_process';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
function resolveShipmentId(): string {
  const out = execSync(`psql "${process.env.DATABASE_URL}" -t -A -c "select id from export_shipments where doc_no = 'EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
  if (!out) throw new Error('EXP-2026-000002 bulunamadı');
  return out;
}
const SHIP = resolveShipmentId();

const TARGETS: Array<{ name: string; route: string; tab?: string }> = [
  { name: 'sevkiyatlar', route: '/ihracat/sevkiyatlar' },
  { name: 'belgeler', route: '/ihracat/belgeler' },
  { name: 'kurlar', route: '/ihracat/kurlar' },
  { name: 'gtip', route: '/ihracat/gtip' },
  { name: 'detay-siparis', route: `/ihracat/sevkiyatlar/${SHIP}` },
  { name: 'detay-belgeler', route: `/ihracat/sevkiyatlar/${SHIP}`, tab: 'Belgeler' },
  { name: 'detay-ceki', route: `/ihracat/sevkiyatlar/${SHIP}`, tab: 'Çeki listesi' },
];

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    for (const t of TARGETS) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { base: BASE, route: t.route, as: 'admin' });
      if (t.tab) { const l = page.getByRole('tab', { name: t.tab }); if (await l.count()) { await l.first().click(); await page.waitForTimeout(400); } }
      const scroll = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      out[`${t.name}__${vp.w}`] = scroll;
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

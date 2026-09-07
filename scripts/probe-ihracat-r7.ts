/** Tur 7 kritik ölçümü: sütun genişliği vs. en uzun içerik (slack), ihracat tabloları. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = 'f835f812-dc9b-42d1-ab8f-0e1bb845b545';

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
  for (const t of TARGETS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: t.route, as: 'admin' });
    if (t.tab) { const l = page.getByRole('tab', { name: t.tab }); if (await l.count()) { await l.first().click(); await page.waitForTimeout(500); } }
    const res = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map((tb) => {
        const ths = Array.from(tb.querySelectorAll('thead th'));
        const rows = Array.from(tb.querySelectorAll('tbody tr')).slice(0, 40);
        const cols = ths.map((th, i) => {
          const w = th.getBoundingClientRect().width;
          let maxContent = 0;
          for (const r of rows) {
            const cell = r.children[i] as HTMLElement | undefined;
            if (!cell) continue;
            const rng = document.createRange();
            rng.selectNodeContents(cell);
            const b = rng.getBoundingClientRect();
            if (b.width > maxContent) maxContent = b.width;
          }
          // başlık metni genişliği
          const hr = document.createRange(); hr.selectNodeContents(th);
          const hw = hr.getBoundingClientRect().width;
          return { head: (th.textContent ?? '').trim().slice(0, 24), width: Math.round(w), maxContent: Math.round(Math.max(maxContent, hw)), slack: Math.round(w - Math.max(maxContent, hw)) };
        });
        return { tableWidth: Math.round(tb.getBoundingClientRect().width), rows: rows.length, cols };
      });
    });
    out[t.name] = res;
    // hover/active/focus tarama
    const ia = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('main button, main a[href], main [role="tab"], main tbody tr'));
      let total = 0, withActive = 0;
      for (const el of els) {
        const cls = el.getAttribute('class') ?? '';
        total++;
        if (/(^|\s|:)active:/.test(cls)) withActive++;
      }
      return { total, withActive };
    });
    out[t.name + '__active'] = ia;
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Tur 8 kritik ölçümü (tur-7 düzeltmelerinin doğrulaması): sütun genişliği vs. en uzun içerik
 * (slack), ihracat tabloları. db:reset sonrası sevkiyat id'leri değiştiği için probe-ihracat-r7.ts'in
 * sabit SHIP UUID'si artık geçersiz — bu betik güncel EXP-2026-000002 (gümrükte) id'sini kullanır.
 */
import { execSync } from 'node:child_process';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
// Bu makinede eşzamanlı başka bir oturum `db:reset` çalıştırabilir (bkz. tur-7 P2 bulgusu) — sabit
// UUID her an geçersiz kalabilir. EXP-2026-000002'nin id'sini HER ÇALIŞTIRMADA veritabanından
// canlı okuyoruz.
function resolveShipmentId(): string {
  const out = execSync(`psql "${process.env.DATABASE_URL}" -t -A -c "select id from export_shipments where doc_no = 'EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
  if (!out) throw new Error('EXP-2026-000002 bulunamadı — db:seed/db:reset çalıştırılmış mı?');
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
          const hr = document.createRange(); hr.selectNodeContents(th);
          const hw = hr.getBoundingClientRect().width;
          return { head: (th.textContent ?? '').trim().slice(0, 24), width: Math.round(w), maxContent: Math.round(Math.max(maxContent, hw)), slack: Math.round(w - Math.max(maxContent, hw)) };
        });
        return { tableWidth: Math.round(tb.getBoundingClientRect().width), rows: rows.length, cols };
      });
    });
    out[t.name] = res;
    const scroll = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    out[t.name + '__scroll'] = scroll;
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

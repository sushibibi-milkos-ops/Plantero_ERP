import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const RANK: Record<string, number> = { Bildirildi: 0, Planlandı: 1, Yapılıyor: 2, 'Parça bekliyor': 2.5, Tamamlandı: 3, İptal: 4 };
const ORDERS = [
  ['MO-2026-000001', '1e416c6c-3226-4c5a-a378-afb4be1914e7'],
  ['MO-2026-000002', 'fd0272dc-10a1-4c91-9789-2369d150f564'],
  ['MO-2026-000003', '30df2b8d-2dad-4450-85b1-99db6634c14a'],
  ['MO-2026-000004', '81ecab58-c5ed-4e21-8536-018862726573'],
  ['MO-2026-000005', '42f49874-677c-4376-81b0-0786ad6f093d'],
  ['MO-2026-000006', 'adb63f49-a66d-489a-91c4-43710203881d'],
];

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const out: Array<Record<string, unknown>> = [];
  for (const [docNo, id] of ORDERS) {
    await openRoute(page, { base, route: `/bakim/is-emirleri/${id}`, as: 'admin' });
    const labels = await page.evaluate(() => {
      const ol = document.querySelector('ol.space-y-4');
      if (!ol) return [];
      return Array.from(ol.querySelectorAll('li')).map((li) => (li.querySelector('span.font-medium') as HTMLElement | null)?.innerText.trim() ?? '');
    });
    const ranks = labels.map((l) => RANK[l] ?? -1);
    let monotonic = true;
    for (let i = 1; i < ranks.length; i++) if (ranks[i]! < ranks[i - 1]!) monotonic = false;
    out.push({ docNo, labels, ranks, monotonic });
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

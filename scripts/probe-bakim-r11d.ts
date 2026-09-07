import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const RANK: Record<string, number> = { Bildirildi: 0, Planlandı: 1, Yapılıyor: 2, 'Parça bekliyor': 2.5, Tamamlandı: 3, İptal: 4 };
// NOT (Tur 11 P1 düzeltmesi): id'ler `pnpm db:reset` sonrası her seferinde yeniden üretilir
// (gen_random_uuid()); önceki turdan kalan sabit id'ler artık DB'de yok. Ölçüm anında güncel
// id'leri `select id, doc_no from maintenance_orders order by doc_no;` ile alıp buraya yazıldı.
const ORDERS = [
  ['MO-2026-000001', '4785f7c4-d277-43c0-aa9f-7f5d53186ca4'],
  ['MO-2026-000002', '2883a799-0161-4a29-9db5-b5fe796313e4'],
  ['MO-2026-000003', 'd36990bf-7023-4dd4-8a1d-2a6c7f760887'],
  ['MO-2026-000004', '2b9c2893-95ad-4508-9b8b-35faae22af11'],
  ['MO-2026-000005', '52b5bd88-693c-43f2-8b3a-7b045c43157a'],
  ['MO-2026-000006', '338ef393-9639-40f1-a4ac-902d59b11cce'],
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

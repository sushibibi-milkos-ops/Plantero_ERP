/** Tur 5 doğrulama — /bakim/makineler: KPI şeridi geometrisi + ilk ekranda görünen satır sayısı (bakim-makineler-01/04/05/06). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const strip = document.querySelector<HTMLElement>('main > div.mb-6, main > div[class*="mb-6"]');
  const kpiEl = document.querySelector<HTMLElement>('main [class*="border-l"]') ?? strip;
  const toolbar = document.querySelector<HTMLElement>('main input[aria-label="Tabloda ara"]');
  const table = document.querySelector<HTMLElement>('main table, main [role="table"]') ?? document.querySelector<HTMLElement>('main .overflow-x-auto');
  const rows = Array.from(document.querySelectorAll<HTMLElement>('main tbody tr'));
  const vh = window.innerHeight;
  const rowsAboveFold = rows.filter((r) => r.getBoundingClientRect().bottom <= vh).length;
  const icons = document.querySelectorAll('main svg[class*="size-4"]').length;
  return {
    kpiHeight: kpiEl ? Math.round(kpiEl.getBoundingClientRect().height) : null,
    kpiTop: kpiEl ? Math.round(kpiEl.getBoundingClientRect().top) : null,
    toolbarTop: toolbar ? Math.round(toolbar.getBoundingClientRect().top) : null,
    tableTop: table ? Math.round(table.getBoundingClientRect().top) : null,
    totalRows: rows.length,
    rowsAboveFold,
    kpiIconCount: icons,
  };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/makineler', base, as: 'admin' });
  const res = await page.evaluate(collect);
  console.log(JSON.stringify(res, null, 1));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

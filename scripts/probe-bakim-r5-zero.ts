/** Tur 5 doğrulama — /bakim/makineler: 'Çalışma saati' ve 'Açık iş emri' sütunlarında sıfır rengi (bakim-makineler-03). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('main tbody tr'));
  const out: unknown[] = [];
  for (const row of rows.slice(0, 6)) {
    const cells = Array.from(row.querySelectorAll('td'));
    const runtime = cells[5]?.querySelector('span.num') as HTMLElement | null;
    const openOrder = cells[6]?.querySelector('span.num') as HTMLElement | null;
    out.push({
      runtimeText: runtime?.textContent?.trim(),
      runtimeColor: runtime ? getComputedStyle(runtime).color : null,
      openOrderText: openOrder?.textContent?.trim(),
      openOrderColor: openOrder ? getComputedStyle(openOrder).color : null,
    });
  }
  return out;
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

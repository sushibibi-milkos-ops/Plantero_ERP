/** Tur 5 doğrulama — /bakim/is-emirleri kanban görünümü: boş sütun yer tutucusu + kart başlığı sarma (bakim-isemirleri-07/08). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/is-emirleri', base, as: 'admin' });
  await page.getByRole('button', { name: 'Kanban görünümü' }).click();
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const cols = Array.from(document.querySelectorAll<HTMLElement>('main .snap-start'));
    const colInfo = cols.map((c) => {
      const countBadge = c.querySelector<HTMLElement>('span.rounded-full');
      const count = countBadge ? parseInt(countBadge.textContent || '0', 10) : 0;
      const placeholder = c.querySelector('.border-dashed');
      const r = c.getBoundingClientRect();
      return { count, height: Math.round(r.height), hasPlaceholder: Boolean(placeholder) };
    });
    const titles = Array.from(document.querySelectorAll<HTMLElement>('main .line-clamp-2')).map((el) => ({
      text: (el.textContent || '').slice(0, 40),
      clientHeight: Math.round(el.getBoundingClientRect().height),
      scrollHeight: el.scrollHeight,
      clamped: el.scrollHeight > el.clientHeight + 1,
    }));
    return { colInfo, titles };
  });
  console.log(JSON.stringify(res, null, 1));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

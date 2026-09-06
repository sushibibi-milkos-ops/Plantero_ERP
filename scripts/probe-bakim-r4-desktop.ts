/** Tur 4 doğrulama — 1440x900 desktop'ta "Son iş emirleri" başlık span'inin genişlik/kırpma durumu (bakim-makine-detay-08). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const out: Record<string, unknown> = {};
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  const spans: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('span.truncate'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    spans.push({
      t: (el.textContent || '').slice(0, 50),
      clientWidth: Math.round(el.clientWidth),
      scrollWidth: Math.round(el.scrollWidth),
      overflow: Math.round(el.scrollWidth - el.clientWidth),
    });
  }
  out.truncateSpans = spans;
  return out;
};

async function main() {
  const argv = process.argv.slice(2);
  const routes = argv.filter((a) => a.startsWith('/'));
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const res: Record<string, unknown> = {};
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route, as: 'admin', base });
    res[route] = await page.evaluate(collect);
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(res, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

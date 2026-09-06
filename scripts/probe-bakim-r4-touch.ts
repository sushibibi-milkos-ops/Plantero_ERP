/** Tur 4 doğrulama — order-detail "diğer iş emirleri" linkinin kutu modeli. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const out: unknown[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/bakim/is-emirleri/"]'))) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push({
      href: el.getAttribute('href'),
      t: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      display: cs.display,
      minHeight: cs.minHeight,
      alignItems: cs.alignItems,
      parentTag: el.parentElement?.tagName,
      parentDisplay: el.parentElement ? getComputedStyle(el.parentElement).display : null,
    });
  }
  return out;
};

async function main() {
  const argv = process.argv.slice(2);
  const routes = argv.filter((a) => a.startsWith('/'));
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const res: Record<string, unknown> = {};
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route, as: 'admin', base });
    res[route] = await page.evaluate(collect);
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(res, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

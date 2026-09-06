/** Tur 3 — mobil (390px) yatay taşmanın kök nedeni: taşan en derin düğüm + kırpan ata. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const out: Record<string, unknown> = {};
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  const vw = document.documentElement.clientWidth;

  // görünüm alanının sağ kenarını aşan (ve ata kırpması yüzünden erişilemeyen) yaprak düğümler
  const beyond: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    if (el.children.length > 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1) {
      beyond.push({
        t: (el.textContent || el.getAttribute('aria-label') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 44),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
        cls: (el.className || '').toString().slice(0, 70),
      });
    }
  }
  out.viewportWidth = vw;
  out.beyondViewport = beyond.slice(0, 14);

  // kırpan ata: overflow hidden/clip taşıyan ve içeriği kendisinden geniş olan kaplar
  const clippers: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const cs = getComputedStyle(el);
    if (!['hidden', 'clip'].includes(cs.overflowX)) continue;
    if (el.scrollWidth - el.clientWidth > 2) {
      clippers.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 70), sw: el.scrollWidth, cw: el.clientWidth, t: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 40) });
    }
  }
  out.clippingAncestors = clippers.slice(0, 10);

  // main kabının kendi overflow ayarı
  out.mainOverflowX = getComputedStyle(main).overflowX;
  out.mainSw = main.scrollWidth;
  out.mainCw = main.clientWidth;
  return out;
};

async function main() {
  const argv = process.argv.slice(2);
  const routes = argv.filter((a) => a.startsWith('/'));
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const res: Record<string, unknown> = {};
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route, as: 'admin', base });
    await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name = (f: unknown) => f; });
    res[route] = await page.evaluate(collect);
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(res, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

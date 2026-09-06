/** Tur 5 — /bakim/makineler mobil kartlarda yatay kırpma (scrollWidth > clientWidth) kaynağı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const collect = () => {
  (globalThis as any).__name = (globalThis as any).__name || function (f: unknown) { return f; };
  const bad = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter((d) => d.scrollWidth > d.clientWidth + 2 && d.clientWidth > 0);
  return bad.slice(0, 10).map((d) => ({
    tag: d.tagName, cls: (d.getAttribute('class') || '').slice(0, 90), sw: d.scrollWidth, cw: d.clientWidth,
    text: (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
    overflow: getComputedStyle(d).overflowX, textOverflow: getComputedStyle(d).textOverflow, ws: getComputedStyle(d).whiteSpace,
    parentCls: (d.parentElement?.getAttribute('class') || '').slice(0, 70),
  }));
};
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route: '/bakim/makineler', base, as: 'admin' });
  console.log(JSON.stringify(await page.evaluate(collect), null, 1));
  await ctx.close(); await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

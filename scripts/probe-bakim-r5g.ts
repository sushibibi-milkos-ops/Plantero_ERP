/** Tur 5 — /bakim/oee 390px: etkileşimsiz açılışta Recharts tooltip görünür mü (3 tekrar)? */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const collect = () => {
  (globalThis as any).__name = (globalThis as any).__name || function (f: unknown) { return f; };
  return Array.from(document.querySelectorAll<HTMLElement>('.recharts-tooltip-wrapper')).map((t) => ({
    vis: getComputedStyle(t).visibility, transform: t.style.transform,
    w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height),
    top: Math.round(t.getBoundingClientRect().top), left: Math.round(t.getBoundingClientRect().left),
    text: (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
  }));
};
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
    console.log(i, JSON.stringify(await page.evaluate(collect)));
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const collect = () => {
  const out: unknown[] = [];
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    if (el.children.length > 0) continue;
    const t = (el.textContent || '').trim();
    if (!/(kW|\bsa\b|\/sa)/.test(t)) continue;
    const cs = getComputedStyle(el);
    out.push({ t, tabular: cs.fontVariantNumeric, fontSize: cs.fontSize });
  }
  return out;
};
async function main() {
  const route = process.argv[2]!;
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route, as: 'admin', base });
  console.log(JSON.stringify(await page.evaluate(collect), null, 1));
  await ctx.close(); await browser.close();
}
main();

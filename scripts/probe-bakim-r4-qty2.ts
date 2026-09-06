import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const collect = () => {
  const out: unknown[] = [];
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('span.num, *'))) {
    const t = (el.textContent || '').trim();
    if (!/\d\s*(kW|sa|\/sa)\b/.test(t) || t.length > 30) continue;
    // yalnızca en dış (en büyük) eşleşen düğümü al: çocuklarından biri de eşleşiyorsa atla
    const childMatches = Array.from(el.children).some((c) => /\d\s*(kW|sa|\/sa)\b/.test((c.textContent||'').trim()));
    if (childMatches) continue;
    const cs = getComputedStyle(el);
    out.push({ t, tabular: cs.fontVariantNumeric, cls: (el.className||'').toString().slice(0,40) });
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

import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const shots: Array<[string, string]> = [
    ['bos-isemirleri', '/bakim/is-emirleri?q=zzzzqqq'],
    ['bos-makineler', '/bakim/makineler?q=zzzzqqq'],
    ['bos-planlar', '/bakim/planlar?q=zzzzqqq'],
    ['kanban', '/bakim/is-emirleri?view=board'],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, route] of shots) {
    await openRoute(page, { base, route, as: 'admin' });
    await page.screenshot({ path: `artifacts/critic/bakim-r12-${name}.png`, fullPage: false });
    out[name] = await page.evaluate(() => {
      const m = document.querySelector('main');
      return { text: (m as HTMLElement)?.innerText.slice(0, 320).replace(/\n/g, ' | '), svgCount: m?.querySelectorAll('svg').length ?? 0 };
    });
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

/** Tur 16: sol-alt siyah dairenin kaynağı (body kökü, shadow DOM dahil). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/bakim/makineler', as: 'admin' });
  const res = await page.evaluate(() => {
    const roots = Array.from(document.body.children).map((e) => ({ tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 40), shadow: !!(e as HTMLElement).shadowRoot }));
    const el = document.elementFromPoint(38, 861);
    return { roots, at: el ? { tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60) } : null };
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

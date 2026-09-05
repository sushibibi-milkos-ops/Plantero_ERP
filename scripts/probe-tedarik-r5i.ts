import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser(); const out: Record<string, any> = {};
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route: '/satin-alma/kritik-stok', as: 'satin_alma' });
    out.kritikClip = await page.evaluate(() => {
      const sc = document.querySelector('main .overflow-auto') as HTMLElement; const sr = sc.getBoundingClientRect();
      const ths = Array.from(document.querySelectorAll('thead th')).map((th) => { const r = th.getBoundingClientRect(); return { t: (th.textContent ?? '').trim(), left: Math.round(r.left), right: Math.round(r.right), clipped: Math.round(r.right - sr.right) }; });
      return { scRight: Math.round(sr.right), sw: sc.scrollWidth, cw: sc.clientWidth, ths };
    });
    await ctx.close(); }
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route: '/ana-veri/cariler/76ed0058-2c5a-47b5-b6e6-ba87e86ab2d2', as: 'satin_alma' });
    out.cariHedef = { url: page.url(), h1: await page.locator('h1').first().textContent().catch(() => null), body: (await page.locator('main').first().textContent().catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 160) };
    await ctx.close(); }
  await browser.close(); writeFileSync('artifacts/critic/probe-tedarik-r5i.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

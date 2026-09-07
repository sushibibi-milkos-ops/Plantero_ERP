import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [key, route, needle] of [
    ['oeeChip', '/bakim/oee', 'HAT2'],
    ['isemirlerPrimary', '/bakim/is-emirleri', 'Arıza bildir'],
    ['isemirlerRow', '/bakim/is-emirleri', 'MO-2026-000006'],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    // gerçek klavye gezinmesi: hedefe ulaşana kadar Tab
    let found: Record<string, unknown> | null = null;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate((n) => {
        const e = document.activeElement as HTMLElement | null;
        if (!e) return null;
        const t = (e.innerText ?? '').trim();
        if (!t.includes(n)) return null;
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return { text: t.slice(0, 40), tag: e.tagName, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 60), bg: cs.backgroundColor, h: +r.height.toFixed(1), w: +r.width.toFixed(1) };
      }, needle);
      if (info) { found = info; break; }
    }
    out[key] = found;
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

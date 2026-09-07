import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PID = '3c293a91-d8d6-4817-8c0d-b0df4223b5ee';
async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler'], ['precete', `/arge/projeler/${PID}/receteler`], ['board', `/arge/projeler/${PID}/board`]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    const chain: any[] = [];
    for (let i = 0; i < 40 && chain.length < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(260);
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest('main')) return null;
        const cs = getComputedStyle(el);
        const shadow = cs.boxShadow.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => !/ 0px 0px 0px 0px$/.test(s));
        return { label: (el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label'), tag: el.tagName, fv: el.matches(':focus-visible'), shadow, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset}`, borderColor: cs.borderColor };
      });
      if (f) chain.push(f);
    }
    out[key] = chain;
    if (key === 'projeler') await page.screenshot({ path: 'artifacts/critic/arge-r15-focus-wait.png' });
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });

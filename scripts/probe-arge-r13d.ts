/** Tur 13 (d) — odak halkası zamanlı ölçüm (Tab sonrası 0/150/400ms). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PID = '9380c23c-1a10-43bc-a879-b98acc2e4cde';

const SNAP = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body || !el.closest('main')) return null;
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName,
    label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
    fv: el.matches(':focus-visible'),
    outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor + ' off:' + cs.outlineOffset,
    boxShadow: cs.boxShadow,
    transition: cs.transitionProperty + ' / ' + cs.transitionDuration + ' / ' + cs.transitionTimingFunction,
  };
})()`;

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  for (const route of ['/arge/projeler', '/arge/receteler', `/arge/projeler/${PID}/receteler`, `/arge/projeler/${PID}/board`]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    const stops: unknown[] = [];
    for (let i = 0; i < 60 && stops.length < 4; i++) {
      await page.keyboard.press('Tab');
      const t0 = await page.evaluate(SNAP);
      if (!t0) continue;
      await page.waitForTimeout(150);
      const t150 = await page.evaluate(SNAP);
      await page.waitForTimeout(300);
      const t450 = await page.evaluate(SNAP);
      stops.push({ t0, t150, t450 });
      if (stops.length === 1) {
        await page.screenshot({ path: `artifacts/critic/arge-r13-focus-${route.replace(/[^a-z]/gi, '').slice(-10)}.png` });
      }
    }
    out['focus_' + route.replace(/[^a-z]/gi, '').slice(-12)] = stops;
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });

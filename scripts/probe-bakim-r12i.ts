import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const ROUTES = ['/bakim/makineler', '/bakim/planlar', '/bakim/is-emirleri', '/bakim/oee', '/bakim/is-emirleri/yeni', '/bakim/makineler/daa41905-b9ad-4454-8e79-ea1448c88af3', '/bakim/is-emirleri/4a9cca52-d4ec-4d48-ae31-4e8912f03da6'];
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};
  for (const route of ROUTES) {
    await openRoute(page, { base, route, as: 'admin' });
    out[route] = await page.evaluate(() => {
      const bad: Array<Record<string, string>> = [];
      const els = Array.from(document.querySelectorAll('main *, header *'));
      for (const e of els) {
        const cs = getComputedStyle(e);
        const durs = cs.transitionDuration.split(',').map((s) => { const v = s.trim(); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000; });
        const maxDur = Math.max(0, ...durs.filter((x) => !Number.isNaN(x)));
        if (maxDur <= 0) continue;
        const id = e.tagName + '.' + String((e as HTMLElement).className).slice(0, 45);
        if (cs.transitionProperty.split(',').map((s) => s.trim()).includes('all')) bad.push({ why: 'transition-property: all', id, dur: cs.transitionDuration });
        if (maxDur >= 300) bad.push({ why: `duration ${maxDur}ms >= 300`, id, prop: cs.transitionProperty.slice(0, 60) });
        if (/cubic-bezier\(0\.4,\s*0,\s*1,\s*1\)/.test(cs.transitionTimingFunction) || /\bease-in\b(?!-out)/.test(cs.transitionTimingFunction)) bad.push({ why: 'ease-in', id, tf: cs.transitionTimingFunction });
      }
      const animated = els.filter((e) => getComputedStyle(e).animationName !== 'none').map((e) => { const cs = getComputedStyle(e); return { name: cs.animationName, dur: cs.animationDuration, id: e.tagName + '.' + String((e as HTMLElement).className).slice(0, 40) }; });
      return { violations: bad.slice(0, 20), violationCount: bad.length, animated: animated.slice(0, 8) };
    });
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

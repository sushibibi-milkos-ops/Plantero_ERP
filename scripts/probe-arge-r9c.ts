/**
 * Tur 9c — arge: reçete eylem şeridi taşması 390/375/360'ta, birden çok projede.
 * Çıktı: artifacts/critic/probe-arge-r9c.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();
const PIDS = [
  ['Fıstık Bazı (v1 Taslak)', 'c2913daa-05c6-46bc-9f48-942e864a651f'],
  ['Şekersiz Protein', '2902918e-e50f-41ae-9f38-f51378a76237'],
  ['Oat Barista v2', '92e43c12-adeb-4c1f-9c13-3bb066b46461'],
] as const;

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  for (const [name, pid] of PIDS) {
    for (const w of [390, 375]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
      });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: `/arge/projeler/${pid}/receteler`, as: 'admin' });
      out[`${name}@${w}`] = await page.evaluate(() => {
        const bar = Array.from(document.querySelectorAll('div')).find((e) =>
          e.className.toString().includes('overflow-x-auto') && e.className.toString().includes('flex-nowrap'),
        ) as HTMLElement | undefined;
        if (!bar) return { found: false };
        const br = bar.getBoundingClientRect();
        const kids = Array.from(bar.querySelectorAll('button')).map((b) => {
          const r = b.getBoundingClientRect();
          return {
            label: (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 26),
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
            hiddenPx: +Math.max(0, r.right - br.right).toFixed(1),
          };
        });
        return {
          found: true,
          barCw: bar.clientWidth,
          barSw: bar.scrollWidth,
          overflowPx: bar.scrollWidth - bar.clientWidth,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          kids,
        };
      });
      await ctx.close();
    }
  }

  writeFileSync('artifacts/critic/probe-arge-r9c.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

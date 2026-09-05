/** Tur 5 — `transition: all` taşıyan elemanı bul + /onaylar boş durum + loading iskeleti. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

async function run() {
  const out: Record<string, unknown> = {};
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/onaylar', as: 'admin', base, dark: false });
    out['transitionAll'] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main *'))
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.transitionProperty === 'all';
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 100),
          dur: getComputedStyle(el).transitionDuration,
          timing: getComputedStyle(el).transitionTimingFunction,
          text: (el.textContent ?? '').slice(0, 30),
        }))
        .slice(0, 10),
    );
    // /onaylar boş durum: kalite hesabıyla (onay yetkisi olmayan roller → 0 kayıt)
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page2 = await ctx2.newPage();
    await openRoute(page2, { route: '/onaylar', as: 'kalite', base, dark: false });
    out['onaylarEmptyKalite'] = await page2.evaluate(() => {
      const main = document.querySelector('main')!;
      return {
        rows: main.querySelectorAll('[role="option"]').length,
        text: (main.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
      };
    });
    await page2.screenshot({ path: resolve(process.cwd(), 'artifacts/screens/onaylar/desktop-empty.png'), animations: 'disabled' });
    await ctx2.close();
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r5c.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => { console.error(e); process.exit(1); });

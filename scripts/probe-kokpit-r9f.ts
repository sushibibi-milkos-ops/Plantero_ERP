/**
 * Tur 9 kokpit prob-F: YUMUŞAK gezinmede kokpit/loading.tsx iskeletini yakala.
 * Prefetch'i de geciktirir (route handler /bildirimler'e gitmeden ÖNCE kurulur), böylece
 * tıklama anında router önbelleğinde /kokpit yoktur ve rota-özel iskelet gerçekten basılır.
 *   tsx scripts/probe-kokpit-r9f.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r9');

const SIG_SRC = `(() => {
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var busy = document.querySelector('[aria-busy]');
  if (!busy) return null;
  var kids = Array.prototype.slice.call(busy.children);
  var strip = null;
  kids.forEach(function (c) { var cl = c.getAttribute('class') || ''; if (!strip && /grid-cols|overflow-x/.test(cl)) strip = c; });
  var s = strip ? getComputedStyle(strip) : null;
  var sr = strip ? strip.getBoundingClientRect() : null;
  var rows = [];
  Array.prototype.slice.call(busy.querySelectorAll('div')).forEach(function (d) {
    var cs = getComputedStyle(d); var b = d.getBoundingClientRect();
    if (b.height < 8 || cs.display !== 'flex') return;
    if (d.querySelectorAll('[class*="animate-pulse"]').length === 0) return;
    rows.push(r1(b.height));
  });
  return {
    busyClass: busy.getAttribute('class') || '',
    children: kids.map(function (c) { return (c.getAttribute('class') || '').slice(0, 110); }),
    strip: strip ? {
      cls: (strip.getAttribute('class') || '').slice(0, 220),
      display: s.display, gridCols: s.gridTemplateColumns, overflowX: s.overflowX,
      borderTopWidth: s.borderTopWidth, borderTopColor: s.borderTopColor, radius: s.borderTopLeftRadius,
      w: r1(sr.width), h: r1(sr.height), n: strip.children.length,
      childW: Array.prototype.slice.call(strip.children).map(function (c) { return r1(c.getBoundingClientRect().width); }),
      childH: Array.prototype.slice.call(strip.children).map(function (c) { return r1(c.getBoundingClientRect().height); })
    } : null,
    flexRowHeights: rows.slice(0, 14)
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  mkdirSync(OUT, { recursive: true });
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({
        viewport: vp, deviceScaleFactor: 2, isMobile: vp.width < 500, hasTouch: vp.width < 500,
        locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
      });
      const page = await ctx.newPage();
      // ÖNCE kur: /kokpit'e giden HER istek (prefetch dahil) 6 sn gecikir
      await page.route('**/*', async (route) => {
        if (/\/kokpit(\?|$)/.test(route.request().url())) await new Promise((r) => setTimeout(r, 6000));
        await route.continue();
      });
      await login(page, base, resolveAccount('admin'), '/bildirimler');
      await page.waitForTimeout(1500);
      const clicked = await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a[href="/kokpit"]'))[0] as HTMLAnchorElement | undefined;
        if (!a) return false;
        a.click();
        return true;
      });
      let hit: unknown = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 20_000) {
        const r = await page.evaluate(SIG_SRC).catch(() => null);
        if (r) { hit = r; await page.screenshot({ path: resolve(OUT, `soft-skeleton-${vp.width}.png`), animations: 'disabled' }); break; }
        await page.waitForTimeout(15);
      }
      out[`soft-${vp.width}`] = { clicked, hit };
      await ctx.close();
      console.error(`✓ ${vp.width}: clicked=${clicked} iskelet=${hit ? 'var' : 'yok'}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r9f.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: probe-r9f.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Tur 9 kokpit prob-E: sert gezinmede ART ARDA görünen TÜM iskelet varyantlarını kaydet
 * ((app)/loading.tsx → kokpit/loading.tsx). Her varyant için imza + ekran görüntüsü.
 *   tsx scripts/probe-kokpit-r9e.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r9');

const SIG_SRC = `(() => {
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var busy = document.querySelector('[aria-busy]');
  if (!busy) return null;
  var kids = Array.prototype.slice.call(busy.children).map(function (c) { return (c.getAttribute('class') || '').slice(0, 90); });
  var sig = (busy.getAttribute('class') || '') + '|' + kids.join('#');
  var strip = null;
  Array.prototype.slice.call(busy.children).forEach(function (c) {
    var cl = c.getAttribute('class') || '';
    if (/grid-cols|overflow-x/.test(cl) && !strip) strip = c;
  });
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
    sig: sig,
    busyClass: (busy.getAttribute('class') || ''),
    children: kids,
    strip: strip ? {
      cls: (strip.getAttribute('class') || '').slice(0, 200),
      display: s.display, gridCols: s.gridTemplateColumns, overflowX: s.overflowX,
      borderTop: s.borderTopWidth, radius: s.borderTopLeftRadius,
      w: r1(sr.width), h: r1(sr.height), n: strip.children.length,
      childW: Array.prototype.slice.call(strip.children).map(function (c) { return r1(c.getBoundingClientRect().width); }),
      childH: Array.prototype.slice.call(strip.children).map(function (c) { return r1(c.getBoundingClientRect().height); })
    } : null,
    flexRowHeights: rows.slice(0, 12)
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
      await login(page, base, resolveAccount('admin'), '/bildirimler');
      const variants: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      const goto = page.goto(`${base}/kokpit`, { waitUntil: 'commit' }).catch(() => null);
      const t0 = Date.now();
      while (Date.now() - t0 < 25_000) {
        const r = (await page.evaluate(SIG_SRC).catch(() => null)) as { sig: string } | null;
        if (r && !seen.has(r.sig)) {
          seen.add(r.sig);
          const idx = variants.length;
          await page.screenshot({ path: resolve(OUT, `skeleton-${vp.width}-v${idx}.png`), animations: 'disabled' });
          variants.push({ ...r, shot: `skeleton-${vp.width}-v${idx}.png` });
        }
        if (seen.size >= 2) break;
        await page.waitForTimeout(15);
      }
      await goto;
      out[`v-${vp.width}`] = variants;
      await ctx.close();
      console.error(`✓ ${vp.width}: ${variants.length} iskelet varyantı`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r9e.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: probe-r9e.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

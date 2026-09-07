/**
 * Tur 9 kokpit prob-D: SERT gezinmede (adres çubuğu / ilk yükleme) loading.tsx iskeletini yakala.
 * Yöntem: goto(waitUntil:'commit') + 20ms aralıklarla [aria-busy] yoklaması; yakalanınca ölç + çek.
 *   tsx scripts/probe-kokpit-r9d.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r9');

const SKEL_SRC = `(() => {
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var busy = document.querySelector('[aria-busy]');
  if (!busy) return { present: false };
  var kids = Array.prototype.slice.call(busy.children);
  var strip = kids[1] || null;
  var s = strip ? getComputedStyle(strip) : null;
  var sr = strip ? strip.getBoundingClientRect() : null;
  var boxes = [];
  Array.prototype.slice.call(busy.querySelectorAll('div')).forEach(function (d) {
    var cs = getComputedStyle(d);
    var b = d.getBoundingClientRect();
    if (b.height < 8 || cs.display !== 'flex') return;
    var sk = d.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]').length;
    if (sk === 0) return;
    boxes.push({ h: r1(b.height), w: r1(b.width), sk: sk, cls: (d.getAttribute('class') || '').slice(0, 60) });
  });
  return {
    present: true,
    strip: strip ? {
      cls: (strip.getAttribute('class') || '').slice(0, 200),
      display: s.display, gridCols: s.gridTemplateColumns,
      borderTop: s.borderTopWidth, borderColor: s.borderTopColor, radius: s.borderTopLeftRadius,
      overflowX: s.overflowX, w: r1(sr.width), h: r1(sr.height), n: strip.children.length,
      childBox: Array.prototype.slice.call(strip.children).map(function (c) { var b = c.getBoundingClientRect(); return [r1(b.width), r1(b.height)]; })
    } : null,
    flexBoxes: boxes,
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
      // önbelleği ısıtmamak için doğrudan sert gezinme
      const goto = page.goto(`${base}/kokpit`, { waitUntil: 'commit' }).catch(() => null);
      let hit: unknown = { present: false };
      const t0 = Date.now();
      let shots = 0;
      while (Date.now() - t0 < 25_000) {
        const r = (await page.evaluate(SKEL_SRC).catch(() => ({ present: false }))) as { present: boolean };
        if (r.present) {
          hit = r;
          if (shots === 0) { await page.screenshot({ path: resolve(OUT, `skeleton-${vp.width}.png`), animations: 'disabled' }); shots++; }
          break;
        }
        await page.waitForTimeout(20);
      }
      await goto;
      out[`skeleton-${vp.width}`] = hit;
      await ctx.close();
      console.error(`✓ ${vp.width}: ${(hit as { present: boolean }).present ? 'iskelet yakalandı' : 'yakalanamadı'}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r9d.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: probe-r9d.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

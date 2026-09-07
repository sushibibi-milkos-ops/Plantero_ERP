/**
 * Tur 9 kokpit prob-C: yükleniyor iskeletini (app/(app)/kokpit/loading.tsx) gerçekten yakala.
 * Yöntem: /bildirimler'de otur, /kokpit'e giden RSC/doküman isteğini 5 sn geciktir, sidebar
 * bağlantısına tıkla, iskelet DOM'unu ölç + ekran görüntüsü al.
 *   tsx scripts/probe-kokpit-r9c.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r9');

const SKEL_SRC = `(() => {
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var busy = document.querySelector('[aria-busy]');
  if (!busy) return { present: false, mainHTML: (document.querySelector('main') || document.body).innerHTML.slice(0, 300) };
  var kids = Array.prototype.slice.call(busy.children);
  var strip = kids[1] || null;
  var s = strip ? getComputedStyle(strip) : null;
  var sr = strip ? strip.getBoundingClientRect() : null;
  var boxes = [];
  Array.prototype.slice.call(busy.querySelectorAll('div')).forEach(function (d) {
    var cs = getComputedStyle(d);
    var b = d.getBoundingClientRect();
    if (b.height < 8) return;
    if (cs.display !== 'flex') return;
    var sk = d.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]').length;
    if (sk === 0) return;
    boxes.push({ h: r1(b.height), w: r1(b.width), sk: sk, cls: (d.getAttribute('class') || '').slice(0, 70) });
  });
  return {
    present: true,
    strip: strip ? {
      cls: (strip.getAttribute('class') || '').slice(0, 160),
      display: s.display, gridCols: s.gridTemplateColumns,
      borderTop: s.borderTopWidth, borderColor: s.borderTopColor, radius: s.borderTopLeftRadius,
      overflowX: s.overflowX,
      w: r1(sr.width), h: r1(sr.height), n: strip.children.length,
      childBox: Array.prototype.slice.call(strip.children).map(function (c) { var b = c.getBoundingClientRect(); return [r1(b.width), r1(b.height)]; })
    } : null,
    flexBoxes: boxes,
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth
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
      const seen: string[] = [];
      await openRoute(page, { base, route: '/bildirimler', as: 'admin' });
      await page.route('**/*', async (route) => {
        const u = route.request().url();
        if (/\/kokpit(\?|$)/.test(u)) { seen.push(u); await new Promise((r) => setTimeout(r, 5000)); }
        await route.continue();
      });
      const nav = page.waitForURL(/\/kokpit/, { timeout: 30_000 }).catch(() => {});
      await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a[href="/kokpit"]'))[0] as HTMLAnchorElement | undefined;
        if (a) a.click();
        else window.history.pushState({}, '', '/kokpit');
      });
      await page.waitForSelector('[aria-busy]', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500);
      out[`skeleton-${vp.width}`] = await page.evaluate(SKEL_SRC);
      (out[`skeleton-${vp.width}`] as Record<string, unknown>).delayedUrls = seen;
      await page.screenshot({ path: resolve(OUT, `skeleton-${vp.width}.png`), animations: 'disabled' });
      await nav;
      await ctx.close();
      console.error(`✓ skeleton ${vp.width} (geciktirilen: ${seen.length})`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r9c.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: probe-r9c.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

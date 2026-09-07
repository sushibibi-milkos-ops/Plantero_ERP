/**
 * Tur 9 kokpit prob-B: sıfır değer soluklaştırma tutarlılığı, yükleniyor iskeleti anatomisi,
 * dev-overlay teyidi, hover/active/focus kapsaması.
 *   tsx scripts/probe-kokpit-r9b.ts
 * Çıktı: artifacts/critic/measure-kokpit-r9/probe-r9b.json (+ iskelet ekran görüntüleri)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];
const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r9');

const ZERO_SRC = `(() => {
  var norm = function (s) { return String(s || '').replace(/\\s+/g, ' ').trim(); };
  var main = document.querySelector('main') || document.body;
  var res = { kpis: [], statCells: [], devOverlay: !!document.querySelector('nextjs-portal, [data-nextjs-toast], #__next-build-watcher') };
  // KPI şeridi kartları
  Array.prototype.slice.call(main.querySelectorAll('[data-slot="kpi-card"], [class*="kpi"]')).forEach(function (el) {
    if (el.querySelector('[data-slot="kpi-card"]')) return;
    var t = norm(el.textContent);
    if (!t) return;
    // değer düğümü: number-flow ya da en büyük fontlu çocuk
    var best = null, bestSize = 0;
    Array.prototype.slice.call(el.querySelectorAll('*')).forEach(function (c) {
      var cs = getComputedStyle(c); var fs = parseFloat(cs.fontSize);
      if (!/[0-9]/.test(norm(c.textContent)) && norm(c.textContent) !== '—') return;
      if (fs > bestSize) { bestSize = fs; best = c; }
    });
    if (!best) return;
    var cs = getComputedStyle(best);
    res.kpis.push({ card: t.slice(0, 40), value: norm(best.textContent).slice(0, 24), size: bestSize, weight: cs.fontWeight, color: cs.color, tabular: cs.fontVariantNumeric });
  });
  // StatStrip hücreleri (grid içi büyük sayı + küçük etiket)
  Array.prototype.slice.call(main.querySelectorAll('section, [data-slot="card"]')).forEach(function (sec) {
    Array.prototype.slice.call(sec.querySelectorAll('.num, [class*="tabular"]')).forEach(function (n) {
      var cs = getComputedStyle(n); var fs = parseFloat(cs.fontSize);
      if (fs < 14) return;
      res.statCells.push({ v: norm(n.textContent).slice(0, 20), size: fs, color: cs.color, tabular: cs.fontVariantNumeric });
    });
  });
  return res;
})()`;

const SKEL_SRC = `(() => {
  var norm = function (s) { return String(s || '').replace(/\\s+/g, ' ').trim(); };
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var busy = document.querySelector('[aria-busy]');
  if (!busy) return { present: false };
  // KPI şeridi adayı: aria-busy içindeki ilk grid/flex sarmalayıcı
  var strip = busy.children[1] || null;
  var s = strip ? getComputedStyle(strip) : null;
  var sr = strip ? strip.getBoundingClientRect() : null;
  var rows = Array.prototype.slice.call(busy.querySelectorAll('div')).filter(function (d) {
    var cs = getComputedStyle(d);
    return cs.display === 'flex' && d.querySelectorAll('[data-slot="skeleton"], [class*="animate-pulse"]').length === 2 && d.getBoundingClientRect().height > 20;
  }).map(function (d) { return r1(d.getBoundingClientRect().height); });
  return {
    present: true,
    strip: strip ? {
      display: s.display, gridCols: s.gridTemplateColumns, border: s.borderTopWidth + ' ' + s.borderTopColor,
      radius: s.borderTopLeftRadius, overflowX: s.overflowX,
      w: r1(sr.width), h: r1(sr.height),
      childCount: strip.children.length,
      childBox: Array.prototype.slice.call(strip.children).map(function (c) { var b = c.getBoundingClientRect(); return [r1(b.width), r1(b.height)]; })
    } : null,
    rowHeights: rows,
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth
  };
})()`;

const INTERACT_SRC = `(() => {
  var main = document.querySelector('main') || document.body;
  var out = { noHover: [], noActive: [], noFocusRing: [], total: 0 };
  var els = Array.prototype.slice.call(main.querySelectorAll('a[href], button, [role="button"]'));
  out.total = els.length;
  // stil sayfalarındaki kurallardan hover/active/focus kapsamasını sınıf adıyla kestir
  els.forEach(function (el) {
    var cls = el.getAttribute('class') || '';
    var t = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24);
    if (!/hover:/.test(cls)) out.noHover.push(t);
    if (!/active:/.test(cls)) out.noActive.push(t);
    if (!/focus-visible:|focus:/.test(cls)) out.noFocusRing.push(t);
  });
  return out;
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  mkdirSync(OUT, { recursive: true });
  try {
    for (const as of ROLES) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light' });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: '/kokpit', as });
      out[`zero-${as}`] = await page.evaluate(ZERO_SRC);
      out[`interact-${as}`] = await page.evaluate(INTERACT_SRC);
      await ctx.close();
      console.error(`✓ zero/interact ${as}`);
    }

    // --- yükleniyor iskeleti: soft-nav sırasında RSC isteğini geciktir ---
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: vp.width < 500, hasTouch: vp.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light' });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: '/bildirimler', as: 'admin' });
      await page.route('**/kokpit*', async (route) => {
        await new Promise((r) => setTimeout(r, 4000));
        await route.continue();
      });
      await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a[href]')).find((x) => (x as HTMLAnchorElement).getAttribute('href') === '/kokpit');
        (a as HTMLAnchorElement | undefined)?.click();
      });
      await page.waitForSelector('[aria-busy]', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(400);
      out[`skeleton-${vp.width}`] = await page.evaluate(SKEL_SRC);
      await page.screenshot({ path: resolve(OUT, `skeleton-${vp.width}.png`), animations: 'disabled' });
      await ctx.close();
      console.error(`✓ skeleton ${vp.width}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r9b.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: probe-r9b.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

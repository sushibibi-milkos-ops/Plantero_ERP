/**
 * Tur 9 kokpit ölçüm probu (docs/DESIGN-SCORECARD.md kural 6).
 *   tsx scripts/probe-kokpit-r9.ts
 * Çıktı: artifacts/critic/measure-kokpit-r9/probe-r9.json
 *
 * Ölçülenler (5 rol × {1440x900, 390x844}):
 *  - bölüm bazında satır sayısı / satır kutusu yüksekliği / bayt-bayt aynı satır çiftleri
 *  - sağ kenar hizası (rightSpread), tabular-nums kapsaması, ikincil sayısal düğümler
 *  - iki kolonun dip dengesi (colSpread; tam genişlikteki bölümler hariç)
 *  - katlama üstü bilgi birimi, kırpılmış metin düğümleri, 44px altı dokunma hedefleri
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  var norm = function (s) { return String(s || '').replace(/\\s+/g, ' ').trim(); };
  var round = function (n) { return Math.round(n * 10) / 10; };
  var vw = window.innerWidth, vh = window.innerHeight;
  var main = document.querySelector('main') || document.body;

  // --- bölümler ---
  var sections = [];
  var secEls = Array.prototype.slice.call(main.querySelectorAll('section, [data-slot="card"]'));
  secEls.forEach(function (sec) {
    var h = sec.querySelector('h2, h3');
    var lis = Array.prototype.slice.call(sec.querySelectorAll(':scope ul > li'));
    if (!h && lis.length === 0) return;
    var r = sec.getBoundingClientRect();
    var texts = [], heights = [];
    lis.forEach(function (li) {
      var rr = li.getBoundingClientRect();
      heights.push(round(rr.height));
      texts.push(norm(li.textContent));
    });
    var seen = {}, dupes = [];
    texts.forEach(function (t) { if (seen[t]) { if (seen[t] === 1) dupes.push(t.slice(0, 90)); seen[t]++; } else seen[t] = 1; });
    var rights = [];
    lis.forEach(function (li) {
      var nums = Array.prototype.slice.call(li.querySelectorAll('.num, [class*="tabular"]'));
      if (nums.length) rights.push(Math.round(nums[nums.length - 1].getBoundingClientRect().right));
    });
    // göreli zaman etiketi çeşitliliği (ayırt edicilik)
    sections.push({
      title: h ? norm(h.textContent) : null,
      left: Math.round(r.left), width: Math.round(r.width),
      top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY),
      rowCount: lis.length,
      hMin: heights.length ? Math.min.apply(null, heights) : null,
      hMax: heights.length ? Math.max.apply(null, heights) : null,
      dupes: dupes,
      distinctTexts: Object.keys(seen).length,
      rightSpread: rights.length ? Math.max.apply(null, rights) - Math.min.apply(null, rights) : null
    });
  });

  // --- kolon dip dengesi (yalnızca yarım genişlikteki bölümler) ---
  var halfs = sections.filter(function (s) { return s.width < vw * 0.6; });
  var byLeft = {};
  halfs.forEach(function (s) { var k = s.left; byLeft[k] = Math.max(byLeft[k] || 0, s.bottom); });
  var bottoms = Object.keys(byLeft).map(function (k) { return byLeft[k]; });
  var colSpread = bottoms.length > 1 ? Math.max.apply(null, bottoms) - Math.min.apply(null, bottoms) : 0;

  // --- katlama üstü satır ---
  var aboveFold = Array.prototype.slice.call(main.querySelectorAll('ul > li')).filter(function (el) {
    return el.getBoundingClientRect().bottom <= vh;
  }).length;

  // --- kırpılmış metin ---
  var clipped = [];
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function (el) {
    if (el.children.length > 0) return;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clipped.push(norm(el.textContent).slice(0, 60));
  });

  // --- tabular-nums kapsaması ---
  var nums = Array.prototype.slice.call(main.querySelectorAll('.num'));
  var numNonTab = nums.filter(function (n) { return getComputedStyle(n).fontVariantNumeric.indexOf('tabular-nums') < 0; }).length;
  // rakam taşıyan tüm yaprak metin düğümleri
  var digitLeaves = [], digitNonTab = [];
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function (el) {
    if (el.children.length > 0) return;
    var t = norm(el.textContent);
    if (!/[0-9]/.test(t)) return;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.getBoundingClientRect().width === 0) return;
    digitLeaves.push(t.slice(0, 40));
    if (cs.fontVariantNumeric.indexOf('tabular-nums') < 0 && cs.fontFamily.toLowerCase().indexOf('mono') < 0) digitNonTab.push(t.slice(0, 40));
  });

  // --- 44px altı dokunma hedefi (main içi) ---
  var small = [];
  Array.prototype.slice.call(main.querySelectorAll('a[href], button, [role="button"], input, select')).forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 44 || r.width < 44) small.push({ t: norm(el.textContent).slice(0, 30), w: round(r.width), h: round(r.height) });
  });

  // --- boş durumlar ---
  var empties = [];
  Array.prototype.slice.call(main.querySelectorAll('[data-slot="empty-state"], [data-empty], section')).forEach(function (el) {
    var t = norm(el.textContent);
    if (!/yok|bulunamadı|listelenir|kayıt yok/i.test(t)) return;
    var svg = el.querySelectorAll('svg').length;
    var act = el.querySelectorAll('a[href], button').length;
    var r = el.getBoundingClientRect();
    empties.push({ t: t.slice(0, 80), svg: svg, actions: act, h: round(r.height) });
  });

  // --- ana sayfa taşması ---
  var de = document.documentElement;
  return {
    vw: vw, vh: vh,
    scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
    sections: sections, colSpread: colSpread, colBottoms: bottoms,
    aboveFold: aboveFold, clipped: clipped,
    numCount: nums.length, numNonTab: numNonTab,
    digitLeaves: digitLeaves.length, digitNonTab: digitNonTab.length, digitNonTabSample: digitNonTab.slice(0, 25),
    touchSmall: small,
    empties: empties
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    for (const as of ROLES) {
      for (const vp of [{ width: 1440, height: 900, m: false }, { width: 390, height: 844, m: true }]) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1, isMobile: vp.m, hasTouch: vp.m,
          locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
        });
        const page = await ctx.newPage();
        await openRoute(page, { base, route: '/kokpit', as });
        out[`${as}-${vp.width}`] = await page.evaluate(SRC);
        await ctx.close();
        console.error(`✓ ${as} ${vp.width}`);
      }
    }
  } finally {
    await browser.close();
  }
  const dir = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r9');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-r9.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: artifacts/critic/measure-kokpit-r9/probe-r9.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

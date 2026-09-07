import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const roles = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  var norm = function (s) { return String(s || '').replace(/\\s+/g, ' ').trim(); };
  var main = document.querySelector('main') || document.body;
  // KPI şeridi: main içindeki ilk grid/flex kapsayıcı — heuristik: h1'den sonraki ilk çocuk konteyner
  var kpi = main.querySelector('[data-slot="kpi-row"], [class*="kpi"]');
  var kpiInfo = null;
  if (!kpi) {
    // ilk seviye çocuklar arasında 3+ eşit sütunlu kapsayıcıyı ara
    var kids = Array.prototype.slice.call(main.querySelectorAll('div'));
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.children.length < 3) continue;
      var t = norm(k.textContent);
      if (t.indexOf('Bugünkü') < 0 && t.indexOf('Açık iş emri') < 0 && t.indexOf('Mal kabul bekleyen') < 0 && t.indexOf('Banka toplamı') < 0) continue;
      kpi = k; break;
    }
  }
  if (kpi) {
    var kr = kpi.getBoundingClientRect();
    var items = Array.prototype.slice.call(kpi.children).map(function (c) {
      var r = c.getBoundingClientRect();
      return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), t: norm(c.textContent).slice(0, 30) };
    });
    kpiInfo = { containerW: Math.round(kr.width), left: Math.round(kr.left), right: Math.round(kr.right), items: items, contentRight: items.length ? Math.max.apply(null, items.map(function (i2) { return i2.right; })) : null };
  }
  // rakam taşıyan metin düğümleri ve tabular-nums
  var nonTab = [];
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function (el) {
    var own = '';
    Array.prototype.slice.call(el.childNodes).forEach(function (n) { if (n.nodeType === 3) own += n.textContent; });
    own = norm(own);
    if (!/[0-9]/.test(own)) return;
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (cs.fontVariantNumeric.indexOf('tabular-nums') < 0) nonTab.push({ t: own.slice(0, 40), cls: (el.getAttribute('class') || '').slice(0, 60), size: cs.fontSize });
  });
  // active/hover kapsaması
  var inter = Array.prototype.slice.call(main.querySelectorAll('a[href], button, [role="button"]'));
  var noActive = [], noHover = [];
  inter.forEach(function (el) {
    var c = el.getAttribute('class') || '';
    if (c.indexOf('active:') < 0) noActive.push(norm(el.textContent).slice(0, 30) + ' | ' + c.slice(0, 50));
    if (c.indexOf('hover:') < 0) noHover.push(norm(el.textContent).slice(0, 30));
  });
  // bölüm arası dikey boşluklar
  var secs = Array.prototype.slice.call(main.querySelectorAll('section, [data-slot="card"]'));
  var gaps = [];
  for (var j = 1; j < secs.length; j++) {
    var a = secs[j - 1].getBoundingClientRect(), b = secs[j].getBoundingClientRect();
    if (Math.abs(a.left - b.left) < 2) gaps.push(Math.round(b.top - a.bottom));
  }
  return { kpi: kpiInfo, nonTabularCount: nonTab.length, nonTabular: nonTab.slice(0, 20), interCount: inter.length, noActive: noActive, noHover: noHover.slice(0, 10), gaps: gaps };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const as of roles) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/kokpit', as, base });
    out[as] = await page.evaluate(SRC);
    await ctx.close();
  }
  console.log(JSON.stringify(out));
  await browser.close();
}
main();

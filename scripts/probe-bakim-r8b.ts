/** Tur 8 — KPI şeridi @390 ve mobil kart iç boşlukları. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var strip = document.querySelector('.scroll-fade-x.snap-x');
  var out = { strip: null, cards: [], gaps: [] };
  if (strip) {
    var kids = Array.prototype.slice.call(strip.children);
    var sr = strip.getBoundingClientRect();
    out.strip = { sw: strip.scrollWidth, cw: strip.clientWidth, count: kids.length,
      fullyVisible: kids.filter(function(k){ var r=k.getBoundingClientRect(); return r.left >= sr.left-0.5 && r.right <= sr.right+0.5; }).length };
    out.cards = kids.map(function(k){ var r=k.getBoundingClientRect(); return { w: Math.round(r.width), label: (k.textContent||'').trim().slice(0,18) }; });
  }
  // DataTable mobil kartlarında sağ değer ile sol metin arası boşluk
  var lis = Array.prototype.slice.call(document.querySelectorAll('ul > li'));
  lis.slice(0,40).forEach(function(li, i){
    var spans = Array.prototype.slice.call(li.querySelectorAll('span,div,p')).filter(function(e){ return e.children.length===0 && (e.textContent||'').trim(); });
    for (var a=0;a<spans.length;a++) for (var b=0;b<spans.length;b++) {
      if (a===b) continue;
      var ra=spans[a].getBoundingClientRect(), rb=spans[b].getBoundingClientRect();
      if (Math.abs(ra.top-rb.top) < 6 && rb.left >= ra.right - 1) {
        var g = Math.round((rb.left - ra.right)*10)/10;
        if (g < 8) out.gaps.push({ row: i, a: (spans[a].textContent||'').trim().slice(0,28), b: (spans[b].textContent||'').trim().slice(0,14), gap: g });
      }
    }
  });
  return out;
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (const route of ['/bakim/oee', '/bakim/makineler', '/bakim/planlar', '/bakim/is-emirleri']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openRoute(page, { route, base, as: 'admin' });
    const res = await page.evaluate(COLLECT);
    console.log(JSON.stringify({ route, ...(res as object) }));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

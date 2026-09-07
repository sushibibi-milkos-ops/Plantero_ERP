/** Tur 8 — mobil DataTable kartlarında alt satırdaki metin ile sağa hizalı değer arası boşluk. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var res = [];
  var lis = Array.prototype.slice.call(document.querySelectorAll('li'));
  lis.forEach(function (li, i) {
    var r = li.getBoundingClientRect();
    if (r.width < 200 || r.height < 40) return;
    var leaves = [];
    (function walk(n){ Array.prototype.forEach.call(n.children, function(c){ if (c.children.length===0 && (c.textContent||'').trim()) leaves.push(c); else walk(c); }); })(li);
    // satırlara grupla
    var rows = {};
    leaves.forEach(function(e){ var b=e.getBoundingClientRect(); var k=Math.round(b.top/4)*4; (rows[k]=rows[k]||[]).push({e:e,b:b}); });
    Object.keys(rows).forEach(function(k){
      var arr = rows[k].sort(function(a,b){return a.b.left-b.b.left;});
      for (var j=0;j<arr.length-1;j++) {
        var gap = Math.round((arr[j+1].b.left - arr[j].b.right)*10)/10;
        if (gap < 8) res.push({ li: i, h: Math.round(r.height*10)/10, gap: gap,
          left: (arr[j].e.textContent||'').trim().slice(0,34), right: (arr[j+1].e.textContent||'').trim().slice(0,20) });
      }
    });
  });
  return { minH: Math.min.apply(null, lis.map(function(l){return l.getBoundingClientRect().height;}).filter(function(h){return h>20;})), tight: res };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (const route of ['/bakim/planlar', '/bakim/makineler', '/bakim/is-emirleri']) {
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

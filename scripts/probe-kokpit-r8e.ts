import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const roles = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];
const SRC = `(() => {
  var norm = function (s) { return String(s || '').replace(/\\s+/g, ' ').trim(); };
  var main = document.querySelector('main') || document.body;
  var labels = ['Bugünkü net ciro','Mal kabul bekleyen','Banka toplamı','Bugünkü sipariş','Açık iş emri'];
  var found = null;
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    if (found) return;
    var own=''; Array.prototype.slice.call(el.childNodes).forEach(function(n){ if(n.nodeType===3) own+=n.textContent; });
    if (labels.indexOf(norm(own)) >= 0) found = el;
  });
  if (!found) return { err: 'kpi label bulunamadı' };
  // yukarı çık: 2+ kardeşi olan ilk ata = KPI satırı
  var card = found;
  while (card && card.parentElement && card.parentElement.children.length < 2) card = card.parentElement;
  var row = card ? card.parentElement : null;
  if (!row) return { err: 'kpi satırı bulunamadı' };
  var rr = row.getBoundingClientRect();
  var items = Array.prototype.slice.call(row.children).map(function(c){
    var r = c.getBoundingClientRect();
    var cs = getComputedStyle(c);
    return { t: norm(c.textContent).slice(0,26), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), borderLeft: cs.borderLeftWidth };
  });
  return { rowClass: (row.getAttribute('class')||'').slice(0,140), rowLeft: Math.round(rr.left), rowRight: Math.round(rr.right), rowW: Math.round(rr.width), display: getComputedStyle(row).display, cols: getComputedStyle(row).gridTemplateColumns, items: items, contentRight: Math.max.apply(null, items.map(function(i){return i.right;})) };
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
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main();

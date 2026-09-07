import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const roles = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  var norm = function (s) { return String(s || '').replace(/\\s+/g, ' ').trim(); };
  var sections = [];
  var secEls = Array.prototype.slice.call(document.querySelectorAll('main section, main [data-slot="card"]'));
  for (var i = 0; i < secEls.length; i++) {
    var sec = secEls[i];
    var h = sec.querySelector('h2, h3');
    var lis = Array.prototype.slice.call(sec.querySelectorAll(':scope ul > li'));
    if (!h && lis.length === 0) continue;
    var r = sec.getBoundingClientRect();
    var rows = lis.map(function (li) {
      var rr = li.getBoundingClientRect();
      return { t: norm(li.textContent), h: Math.round(rr.height * 10) / 10 };
    });
    var rights = [];
    lis.forEach(function (li) {
      var nums = Array.prototype.slice.call(li.querySelectorAll('.num, [class*="tabular"]'));
      if (nums.length) rights.push(Math.round(nums[nums.length - 1].getBoundingClientRect().right));
    });
    sections.push({
      title: h ? norm(h.textContent) : null,
      top: Math.round(r.top + window.scrollY),
      bottom: Math.round(r.bottom + window.scrollY),
      rowCount: rows.length,
      rows: rows,
      rightSpread: rights.length ? Math.max.apply(null, rights) - Math.min.apply(null, rights) : null
    });
  }
  var above = Array.prototype.slice.call(document.querySelectorAll('main ul > li')).filter(function (el) { return el.getBoundingClientRect().bottom <= 900; }).length;
  var clipped = [];
  Array.prototype.slice.call(document.querySelectorAll('main *')).forEach(function (el) {
    if (el.children.length > 0) return;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clipped.push(norm(el.textContent).slice(0, 60));
  });
  var nums = Array.prototype.slice.call(document.querySelectorAll('main .num'));
  var nonTabular = nums.filter(function (n) { return getComputedStyle(n).fontVariantNumeric.indexOf('tabular-nums') < 0; }).length;
  return { sections: sections, aboveFoldRows: above, clipped: clipped, numCount: nums.length, nonTabular: nonTabular };
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

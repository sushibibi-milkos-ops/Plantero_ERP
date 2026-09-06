import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const PID = '7d57091d-eb72-442c-87f9-234839576c6f';
async function run(browser: any, route: string, w: number, h: number, fn: string) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage(); await openRoute(page, { route, as: 'admin', base: defaultBaseUrl() });
  const out = await page.evaluate(fn); await ctx.close(); return out;
}
const fn = `(() => {
  const main = document.querySelector('main');
  const ff = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g,'');
  const moneys = [];
  for (const e of Array.from(main.querySelectorAll('*'))) {
    if (e.children.length) continue; const t=(e.textContent||'').trim();
    if (/^₺[\\d.,]+$/.test(t)) { const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); moneys.push({t, ff:ff(e), fs:cs.fontSize, fw:cs.fontWeight, fvn:cs.fontVariantNumeric, right:Math.round(r.right), top:Math.round(r.top)}); }
  }
  // bordered rectangles inside the cost card
  const card = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-xl/.test(c) && /border/.test(c); });
  let borders = [];
  if (card) {
    for (const e of Array.from(card.querySelectorAll('*'))) {
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      const bw = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k=>parseFloat(cs[k]));
      const full = bw.every(v=>v>0);
      if (full && r.width>20 && r.height>16) borders.push({ tag:e.tagName.toLowerCase(), cls:(typeof e.className==='string'?e.className:'').slice(0,60), w:Math.round(r.width), h:Math.round(r.height) });
    }
  }
  // native selects vs shadcn triggers
  const nativeSel = Array.from(main.querySelectorAll('select')).map(s=>{const cs=getComputedStyle(s); const r=s.getBoundingClientRect(); return {label:s.getAttribute('aria-label'), w:Math.round(r.width), h:Math.round(r.height), appearance:cs.appearance||cs.webkitAppearance, ff:ff(s), fs:cs.fontSize};});
  const shadSel = Array.from(main.querySelectorAll('[data-slot=select-trigger],[data-slot=popover-trigger]')).map(s=>{const r=s.getBoundingClientRect(); return {t:(s.textContent||'').trim().slice(0,16), w:Math.round(r.width), h:Math.round(r.height), icons:s.querySelectorAll('svg').length};});
  // numeric column header vs value right edges
  const heads = {};
  for (const e of Array.from(main.querySelectorAll('*'))) {
    if (e.children.length) continue; const t=(e.textContent||'').trim();
    if (['Birim maliyet','Fire %','Satır maliyeti','Miktar'].includes(t)) { const r=e.getBoundingClientRect(); if (r.top < 700) heads[t]={right:Math.round(r.right), top:Math.round(r.top), fs:getComputedStyle(e).fontSize}; }
  }
  return { moneys, borderedCount: borders.length, borders: borders.slice(0,20), nativeSel, shadSel: shadSel.slice(0,8), heads };
})()`;
async function main(){ const b=await launchBrowser(); const res:any={};
  res.d1440 = await run(b, `/arge/projeler/${PID}/receteler`, 1440, 900, fn);
  res.d390 = await run(b, `/arge/projeler/${PID}/receteler`, 390, 844, fn);
  console.log(JSON.stringify(res,null,1)); await b.close(); }
main();

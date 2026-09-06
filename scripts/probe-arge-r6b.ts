import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const ROUTE = '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler';
const FN = `(() => {
  const main = document.querySelector('main');
  const mainTop = Math.round(main.getBoundingClientRect().top);
  const leaves = Array.from(main.querySelectorAll('*')).filter(e => !e.children.length && (e.textContent||'').trim() && e.getBoundingClientRect().height > 0);
  const fontSizes = {};
  for (const e of leaves) { const k = String(Math.round(parseFloat(getComputedStyle(e).fontSize))); fontSizes[k] = (fontSizes[k]||0)+1; }
  const rows = Array.from(document.querySelectorAll('[role="row"]')).map(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height*10)/10, t: Math.round(r.top), txt: (e.textContent||'').replace(/\\s+/g,' ').slice(0,34) }; });
  const heads = Array.from(document.querySelectorAll('[role="columnheader"]')).map(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { t:(e.textContent||'').trim(), left:Math.round(r.left*10)/10, right:Math.round(r.right*10)/10, fs:cs.fontSize, tt:cs.textTransform, ta:cs.textAlign }; });
  const money = [];
  for (const e of leaves) { const t=(e.textContent||'').trim(); if (/^[−-]?₺[\\d.,]+$/.test(t)) { const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); money.push({t, ff:cs.fontFamily.split(',')[0].replace(/["']/g,''), fs:cs.fontSize, fw:cs.fontWeight, fvn:cs.fontVariantNumeric, right:Math.round(r.right*10)/10, top:Math.round(r.top)}); } }
  const qty = [];
  for (const e of leaves) { const t=(e.textContent||'').trim(); if (/^[\\d]+,\\d{4}$/.test(t)) { const r=e.getBoundingClientRect(); qty.push({t, right:Math.round(r.right*10)/10}); } }
  const qtyInputs = Array.from(main.querySelectorAll('input')).map(i => ({ v:i.value, w:Math.round(i.getBoundingClientRect().width), h:Math.round(i.getBoundingClientRect().height), right:Math.round(i.getBoundingClientRect().right) }));
  const card = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-xl/.test(c) && /border/.test(c); });
  const borders = [];
  if (card) { for (const e of Array.from(card.querySelectorAll('*'))) { const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
    const bw=['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k=>parseFloat(cs[k]));
    if (bw.every(v=>v>0) && r.width>20 && r.height>16) borders.push({tag:e.tagName.toLowerCase(), cls:(typeof e.className==='string'?e.className:'').slice(0,54), w:Math.round(r.width), h:Math.round(r.height)}); } }
  const nativeSelects = Array.from(main.querySelectorAll('select')).length;
  const tbl = document.querySelector('[role="table"]');
  const hedef = Array.from(main.querySelectorAll('*')).find(e => (e.textContent||'').trim().startsWith('Hedef maliyete göre'));
  const cards390 = Array.from(main.querySelectorAll('[role="row"]')).map(e=>Math.round(e.getBoundingClientRect().height*10)/10);
  return { mainTop, fontSizes, rows, heads, money, qty, qtyInputs, borders, borderCount: borders.length, nativeSelects,
    tableTop: tbl ? Math.round(tbl.getBoundingClientRect().top) : null,
    tableScroll: tbl ? { sw: tbl.scrollWidth, cw: tbl.clientWidth } : null,
    hedefTop: hedef ? Math.round(hedef.getBoundingClientRect().top) : null,
    docH: document.documentElement.scrollHeight, cards390 };
})()`;
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    out[String(vp.width)] = await page.evaluate(FN);
    await ctx.close();
  }
  console.log(JSON.stringify(out));
  await browser.close();
}
main();

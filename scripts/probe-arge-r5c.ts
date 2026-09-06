import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const PID = '7d57091d-eb72-442c-87f9-234839576c6f';
async function run(browser: any, route: string, w: number, h: number, fn: string) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route, as: 'admin', base: defaultBaseUrl() });
  const out = await page.evaluate(fn);
  await ctx.close();
  return out;
}
const fn = `(() => {
  const r1=(n)=>Math.round(n*10)/10;
  const main = document.querySelector('main');
  // main-only font size distribution
  const fs = {};
  for (const el of Array.from(main.querySelectorAll('*'))) {
    let has=false; for (const n of Array.from(el.childNodes)) if (n.nodeType===3 && (n.textContent||'').trim()) { has=true; break; }
    if (!has) continue; const cs=getComputedStyle(el); const r=el.getBoundingClientRect(); if (r.width<=0||r.height<=0||cs.display==='none') continue;
    const k=String(r1(parseFloat(cs.fontSize))); fs[k]=(fs[k]||0)+1;
  }
  // ingredient row header style
  const th = Array.from(main.querySelectorAll('*')).find(e=>e.children.length===0 && (e.textContent||'').trim()==='Birim maliyet');
  const thInfo = th ? (()=>{const cs=getComputedStyle(th); const r=th.getBoundingClientRect(); return {fs:cs.fontSize, tt:cs.textTransform, ls:cs.letterSpacing, color:cs.color, right:Math.round(r.right), bgParent:getComputedStyle(th.parentElement).backgroundColor};})() : null;
  // right edges in Birim maliyet column
  const edges = [];
  for (const e of Array.from(main.querySelectorAll('*'))) {
    if (e.children.length) continue; const t=(e.textContent||'').trim();
    if (/^₺(120,00|15,00|22,00)$/.test(t)) { const r=e.getBoundingClientRect(); edges.push({t, right:Math.round(r.right), fs:getComputedStyle(e).fontSize}); }
  }
  const manual = Array.from(main.querySelectorAll('input')).find(i=>i.value==='38,00');
  const manualR = manual ? Math.round(manual.getBoundingClientRect().right) : null;
  const manualPadRight = manual ? getComputedStyle(manual).paddingRight : null;
  // sections heights inside cost card
  const card = main.querySelector('.rounded-xl.border, [class*=rounded-xl][class*=border]');
  const cardInfo = card ? (()=>{const r=card.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top)};})() : null;
  // summary line
  const sum = Array.from(main.querySelectorAll('*')).find(e=>/Malzeme maliyeti/.test(e.textContent||'') && e.children.length>0 && (e.textContent||'').length<80);
  const sumInfo = sum ? {cls:(typeof sum.className==='string'?sum.className:'').slice(0,120), h:Math.round(sum.getBoundingClientRect().height), text:(sum.textContent||'').trim()} : null;
  // ingredient row heights (div rows)
  const rows = Array.from(main.querySelectorAll('[class*=grid][class*=border-b], tbody tr')).map(e=>r1(e.getBoundingClientRect().height)).filter(h=>h>20);
  // hover / transition scan on interactive elements
  const trans = new Set();
  for (const el of Array.from(main.querySelectorAll('*')).slice(0,600)) { const cs=getComputedStyle(el); if (cs.transitionProperty && cs.transitionProperty!=='none' && cs.transitionProperty!=='all') continue; if (cs.transitionProperty==='all') trans.add((typeof el.className==='string'?el.className:'').slice(0,60)); }
  return { fontSizes_main: fs, header_birimMaliyet: thInfo, textEdges: edges, manualInputRight: manualR, manualPadRight, card: cardInfo, summary: sumInfo, ingredientRowHeights: rows, transitionAllSamples: Array.from(trans).slice(0,8) };
})()`;
async function main(){
  const b = await launchBrowser();
  const res:any = {};
  res.d1440 = await run(b, `/arge/projeler/${PID}/receteler`, 1440, 900, fn);
  res.d390 = await run(b, `/arge/projeler/${PID}/receteler`, 390, 844, fn);
  console.log(JSON.stringify(res,null,1));
  await b.close();
}
main();

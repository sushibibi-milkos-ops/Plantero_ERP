import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => { const main=document.querySelector('main');
 const card = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-xl/.test(c) && /border/.test(c); });
 const res={borderOnly:0, shadowOnly:0, both:0, list:[]};
 if(!card) return res;
 const els=card.querySelectorAll('*');
 for(let i=0;i<els.length;i++){ const e=els[i]; const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
  if(r.width<=20||r.height<=16) continue;
  const bws=['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k=>parseFloat(cs[k]));
  const hasBorder = bws.every(v=>v>0);
  const sh = cs.boxShadow;
  const hasShadow = sh!=='none' && /rgba?\\((?!0, 0, 0, 0\\))/.test(sh.replace(/rgba\\(0, 0, 0, 0\\)[^,]*,?/g,''));
  if(hasBorder&&hasShadow) res.both++; else if(hasBorder) res.borderOnly++; else if(hasShadow) res.shadowOnly++;
  if(hasBorder||hasShadow) res.list.push({tag:e.tagName.toLowerCase(), v:(e.value!==undefined?String(e.value):(e.textContent||'').trim()).slice(0,12), w:Math.round(r.width), h:Math.round(r.height), border:hasBorder, shadow:hasShadow});
 }
 res.total = res.borderOnly+res.shadowOnly+res.both;
 return res; })()`;
async function main() {
  const browser = await launchBrowser();
  for (const vp of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp===390?844:900 }, deviceScaleFactor: 1, isMobile: vp<500, hasTouch: vp<500, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler', as: 'admin' });
    const r: any = await page.evaluate(FN);
    console.log(vp, 'total', r.total, 'borderOnly', r.borderOnly, 'shadowOnly', r.shadowOnly, 'both', r.both);
    console.log(JSON.stringify(r.list));
    await ctx.close();
  }
  await browser.close();
}
main();

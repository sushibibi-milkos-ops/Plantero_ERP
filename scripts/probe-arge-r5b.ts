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

const listFn = `(() => {
  const main = document.querySelector('main');
  const mr = main.getBoundingClientRect();
  const row = document.querySelector('tbody tr') || document.querySelector('main ul > li');
  const rr = row ? row.getBoundingClientRect() : null;
  return { mainTop: Math.round(mr.top), firstRowViewportTop: rr ? Math.round(rr.top) : null, firstRowMainOffset: rr ? Math.round(rr.top - mr.top) : null, mainScrollTop: main.scrollTop };
})()`;

const costFn = `(() => {
  const r1 = (n) => Math.round(n*10)/10;
  const main = document.querySelector('main');
  const mr = main.getBoundingClientRect();
  const texts = Array.from(document.querySelectorAll('*')).filter(e => (e.textContent||'').trim().startsWith('Hedef maliyete göre') && e.children.length === 0);
  const label = texts[0];
  const panel = label ? label.closest('div') : null;
  const pr = panel ? panel.getBoundingClientRect() : null;
  // hero metric
  const hero = Array.from(document.querySelectorAll('*')).filter(e => e.children.length===0 && /^₺31,92$/.test((e.textContent||'').trim()));
  const heroInfo = hero.map(e => { const cs = getComputedStyle(e); const r=e.getBoundingClientRect(); return { size: cs.fontSize, weight: cs.fontWeight, color: cs.color, fvn: cs.fontVariantNumeric, top: Math.round(r.top - mr.top), ctx: (e.parentElement?.textContent||'').trim().slice(0,60) }; });
  // target 28,00
  const tgt = Array.from(document.querySelectorAll('*')).filter(e => e.children.length===0 && /₺28,00/.test((e.textContent||'').trim()));
  const tgtInfo = tgt.map(e => { const cs = getComputedStyle(e); return { size: cs.fontSize, weight: cs.fontWeight, color: cs.color, fvn: cs.fontVariantNumeric }; });
  // bordered/filled container nesting inside main
  function frames(el, depth, acc) {
    for (const c of Array.from(el.children)) {
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
      const bg = cs.backgroundColor;
      const filled = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const isFrame = (hasBorder || filled) && r.width > 120 && r.height > 40;
      frames(c, depth + (isFrame?1:0), acc);
      if (isFrame) acc.push({ depth: depth+1, w: Math.round(r.width), h: Math.round(r.height), cls: (typeof c.className==='string'? c.className:'').slice(0,90), border: cs.borderTopWidth+'/'+cs.borderBottomWidth, bg });
    }
    return acc;
  }
  const fr = frames(main, 0, []).filter(f => f.depth >= 3).slice(0, 12);
  const maxDepth = Math.max(0, ...frames(main,0,[]).map(f=>f.depth));
  // input heights in ingredient table
  const inputs = Array.from(document.querySelectorAll('input[data-slot=input]')).map(e => { const r = e.getBoundingClientRect(); const cs=getComputedStyle(e); return { w: r1(r.width), h: r1(r.height), val: e.value, ta: cs.textAlign, fvn: cs.fontVariantNumeric, fs: cs.fontSize }; });
  // currency prefix gap in row1
  const tlSpans = Array.from(document.querySelectorAll('span,div')).filter(e => e.children.length===0 && (e.textContent||'').trim()==='₺');
  const gaps = tlSpans.map(e => { const r = e.getBoundingClientRect(); const inp = e.parentElement?.querySelector('input'); const ir = inp?.getBoundingClientRect(); return { tlRight: Math.round(r.right), inputRight: ir?Math.round(ir.right):null, gapToDigitsApprox: ir? Math.round(ir.right - r.right):null }; });
  // rows in ingredient table
  const trs = Array.from(document.querySelectorAll('table tbody tr')).map(e => r1(e.getBoundingClientRect().height));
  return { mainTop: Math.round(mr.top), panelTopViewport: pr?Math.round(pr.top):null, panelTopMainOffset: pr?Math.round(pr.top-mr.top):null, hero: heroInfo, target: tgtInfo, frameMaxDepth: maxDepth, deepFrames: fr, inputs, currencyPrefix: gaps, ingredientRowHeights: trs };
})()`;

const tabsFn = `(() => {
  const tabs = Array.from(document.querySelectorAll('a')).filter(a => ['Pano','Deneme Reçeteleri'].includes((a.textContent||'').trim()));
  return tabs.map(a => { const r = a.getBoundingClientRect(); const cs = getComputedStyle(a); return { t: (a.textContent||'').trim(), w: Math.round(r.width*10)/10, h: Math.round(r.height*10)/10, px: cs.paddingLeft+'/'+cs.paddingRight, minW: cs.minWidth }; });
})()`;

async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  res.projeler_1440 = await run(browser, '/arge/projeler', 1440, 900, listFn);
  res.receteler_1440 = await run(browser, '/arge/receteler', 1440, 900, listFn);
  res.precete_1440 = await run(browser, `/arge/projeler/${PID}/receteler`, 1440, 900, costFn);
  res.precete_390 = await run(browser, `/arge/projeler/${PID}/receteler`, 390, 844, costFn);
  res.tabs_390 = await run(browser, `/arge/projeler/${PID}/board`, 390, 844, tabsFn);
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
}
main();

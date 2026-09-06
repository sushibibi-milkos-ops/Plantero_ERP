import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const ROUTE = '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler';
const FN = `(() => {
  const main = document.querySelector('main');
  const rows = Array.from(document.querySelectorAll('[role="row"]')).map(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height*10)/10, txt: (e.textContent||'').replace(/\\s+/g,' ').slice(0,26) }; });
  const heads = Array.from(document.querySelectorAll('[role="columnheader"]')).map(e => { const r=e.getBoundingClientRect(); return { t:(e.textContent||'').trim(), right:Math.round(r.right*10)/10 }; });
  const leaves = Array.from(main.querySelectorAll('*')).filter(e => !e.children.length && (e.textContent||'').trim());
  const money = leaves.filter(e=>/^[−-]?₺[\\d.,]+$/.test((e.textContent||'').trim())).map(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();return{t:e.textContent.trim(),fs:cs.fontSize,right:Math.round(r.right*10)/10,top:Math.round(r.top)};});
  const inputs = Array.from(main.querySelectorAll('input')).map(i=>{const r=i.getBoundingClientRect();const cs=getComputedStyle(i);return{v:i.value,h:Math.round(r.height),right:Math.round(r.right*10)/10,bw:cs.borderTopWidth,br:cs.borderTopColor};});
  const hedef = Array.from(main.querySelectorAll('*')).find(e => (e.textContent||'').trim().startsWith('Hedef maliyete göre'));
  const card = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-xl/.test(c) && /border/.test(c); });
  let bc=0; if (card) for (const e of Array.from(card.querySelectorAll('*'))) { const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); const bw=['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k=>parseFloat(cs[k])); if (bw.every(v=>v>0)&&r.width>20&&r.height>16) bc++; }
  const fontSizes={}; for (const e of leaves) { if(e.getBoundingClientRect().height>0){const k=String(Math.round(parseFloat(getComputedStyle(e).fontSize))); fontSizes[k]=(fontSizes[k]||0)+1;} }
  return { rows, heads, money, inputs, bc, fontSizes, hedefTop: hedef?Math.round(hedef.getBoundingClientRect().top):null, docH: document.documentElement.scrollHeight };
})()`;
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    // v1 (taslak) seç
    if (vp.width >= 700) { await page.getByRole('button', { name: /^v1/ }).first().click(); }
    else { await page.locator('[data-slot="select-trigger"]').first().click(); await page.getByRole('option', { name: /v1/ }).first().click(); }
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    out[String(vp.width)] = await page.evaluate(FN);
    await page.screenshot({ path: `artifacts/critic/arge-r6-v1-${vp.width}.png`, fullPage: vp.width < 700 });
    await ctx.close();
  }
  console.log(JSON.stringify(out));
  await browser.close();
}
main();

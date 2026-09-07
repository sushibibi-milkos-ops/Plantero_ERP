import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTE = '/arge/projeler/501ef0c7-3273-43ae-9a81-15563cff78a9/receteler';

const FN = `(() => {
  const main = document.querySelector('main');
  const outer = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-xl/.test(c) && /border/.test(c); });
  const outerRect = outer.getBoundingClientRect();
  // CostSimulator kök: outer'ın ilk çocuğu (p-1.5/p-4 dolgulu) içindeki space-y-2/md:space-y-6 div
  const root = outer.firstElementChild;
  const sections = Array.from(root.children).map(c => { const r = c.getBoundingClientRect(); return { cls:(typeof c.className==='string'?c.className:'').slice(0,70), top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height), text:(c.textContent||'').replace(/\\s+/g,' ').slice(0,50) }; });
  const table = document.querySelector('[role="table"]');
  const firstDataRow = Array.from(document.querySelectorAll('[role="row"]'))[1];
  return {
    outerTop: Math.round(outerRect.top),
    outerPaddingTop: parseFloat(getComputedStyle(outer).paddingTop),
    sections,
    tableTop: table ? Math.round(table.getBoundingClientRect().top) : null,
    firstDataRowTop: firstDataRow ? Math.round(firstDataRow.getBoundingClientRect().top) : null,
    chrome: (firstDataRow ? firstDataRow.getBoundingClientRect().top : 0) - outerRect.top,
    docH: document.documentElement.scrollHeight,
    viewportH: window.innerHeight,
  };
})()`;

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
  console.log('V2 (readonly)', JSON.stringify(await page.evaluate(FN), null, 1));
  await browser.close();
}
main();

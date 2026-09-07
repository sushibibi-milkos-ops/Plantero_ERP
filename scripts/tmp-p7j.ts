import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const probe = () => {
  const txt = (el: Element|null) => (el?.textContent ?? '').replace(/\s+/g,' ').trim();
  const main = document.querySelector('main')!;
  const vh = window.innerHeight;
  const vis = (el: Element) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0; };
  const above = (el: Element) => el.getBoundingClientRect().top < vh && el.getBoundingClientRect().bottom > 0;
  const li = Array.from(main.querySelectorAll('li')).filter(e=>vis(e)&&above(e));
  // bölüm içi tek satırlık özet satırları (h-11 flex) + StatStrip hücreleri + KPI kartları
  const summary = Array.from(main.querySelectorAll<HTMLElement>('section > div.flex.h-11')).filter(e=>vis(e)&&above(e));
  const stripCells = Array.from(main.querySelectorAll<HTMLElement>('section .grid > *')).filter(e=>vis(e)&&above(e)&&txt(e).length>0);
  const kpi = Array.from(main.querySelectorAll<HTMLElement>('a')).filter(e=>vis(e)&&above(e)&&e.getBoundingClientRect().top < 300 && e.getBoundingClientRect().height>60);
  return { vh, li: li.length, summary: summary.length, stripCells: stripCells.length, kpi: kpi.length, total: li.length+summary.length+stripCells.length+kpi.length };
};
(async () => {
  const browser = await launchBrowser();
  for (const as of ['admin','depo','muhasebe','satis','uretim_sefi']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as });
    const d = await page.evaluate(`(()=>{const __name=(f)=>f; return (${probe.toString()})();})()`);
    console.log(as, JSON.stringify(d));
    await ctx.close();
  }
  await browser.close();
})();

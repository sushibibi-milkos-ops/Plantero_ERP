import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const probe = () => {
  const txt = (el: Element|null) => (el?.textContent ?? '').replace(/\s+/g,' ').trim();
  const main = document.querySelector('main')!;
  const sec = Array.from(main.querySelectorAll('section')).find(s => /Son aktiviteler/.test(txt(s.querySelector('h2'))));
  if (!sec) return { found: false };
  const lis = Array.from(sec.querySelectorAll('li'));
  return { found: true, n: lis.length, secH: Math.round(sec.getBoundingClientRect().height),
    rows: lis.map(li => { const sp = li.querySelector('span'); return { t: txt(li).slice(0,90), clientW: sp?.clientWidth, scrollW: sp?.scrollWidth, clipped: !!sp && sp.scrollWidth > sp.clientWidth + 1 }; }) };
};
(async () => {
  const w = Number(process.argv[3] ?? 1440), h = w < 700 ? 844 : 900;
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w<700, hasTouch: w<700, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as: process.argv[2] ?? 'admin' });
  console.log(JSON.stringify(await page.evaluate(`(()=>{const __name=(f)=>f; return (${probe.toString()})();})()`), null, 1));
  await browser.close();
})();

import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const probe = () => {
  const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main')!;
  const vis = (el: Element) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const out: any[] = [];
  for (const li of Array.from(main.querySelectorAll<HTMLElement>('li')).filter(vis)) {
    const sec = txt(li.closest('section')?.querySelector('h2,h3') ?? null);
    if (!/duruş|hunisi/i.test(sec)) continue;
    const leaves = Array.from(li.querySelectorAll<HTMLElement>('*')).filter((e) => vis(e) && e.children.length === 0 && txt(e).length > 0)
      .map((e) => ({ t: txt(e).slice(0, 28), l: Math.round(e.getBoundingClientRect().left), r: Math.round(e.getBoundingClientRect().right), h: Math.round(e.getBoundingClientRect().height), fs: getComputedStyle(e).fontSize }));
    const r = li.getBoundingClientRect();
    out.push({ sec, top: Math.round(r.top), h: Math.round(r.height * 10) / 10, cls: (li.className||'').slice(0,60), inner: (li.firstElementChild as HTMLElement)?.className?.slice(0,80), leaves });
  }
  return out;
};
(async () => {
  const as = process.argv[2] ?? 'uretim_sefi';
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as });
  const d = await page.evaluate(`(() => { const __name = (f)=>f; return (${probe.toString()})(); })()`);
  console.log(JSON.stringify(d, null, 1));
  await browser.close();
})();

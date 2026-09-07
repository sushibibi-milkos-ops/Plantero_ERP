import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const PID = 'e1794a07-df66-432a-80c9-1b92a08feb38';
const base = defaultBaseUrl();
async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  // mobil liste kart ofseti
  for (const pair of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: pair[1]!, as: 'admin' });
    out[pair[0] + '_390_cardOffset'] = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const cards = [...main.querySelectorAll('li, [data-slot="card"], a')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 200 && r.height > 40 && r.top > 0;
      });
      const c = cards[0];
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { top_viewport: Math.round(r.top), top_mainOffset: Math.round(r.top - main.getBoundingClientRect().top), h: Math.round(r.height), tag: c.tagName, cls: (c.className ?? '').toString().slice(0, 60) };
    });
    await ctx.close();
  }
  // mobil reçete satırı: fire % etiketi
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
  out.mobil_fireContext = await page.evaluate(() => {
    const res: unknown[] = [];
    for (const inp of [...document.querySelectorAll('main input')] as HTMLInputElement[]) {
      const r = inp.getBoundingClientRect();
      if (r.width === 0 || r.width > 100) continue;
      if (!/^\d$/.test(inp.value)) continue;
      const wrap = inp.closest('div')!;
      const parent = wrap.parentElement!;
      res.push({
        v: inp.value,
        aria: inp.getAttribute('aria-label'), title: inp.getAttribute('title'), id: inp.id,
        labelledby: inp.getAttribute('aria-labelledby'),
        wrapText: (wrap.textContent ?? '').trim(),
        parentText: (parent.textContent ?? '').trim().slice(0, 60),
        siblingsVisibleText: [...parent.children].map((c) => (c as HTMLElement).innerText?.trim().slice(0, 20)),
      });
    }
    // ekranda 'Fire' sözcüğü görünür mü
    const vis = [...document.querySelectorAll('main *')].filter((e) => {
      const t = (e.textContent ?? '').trim();
      if (!t.toLowerCase().startsWith('fire')) return false;
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }).map((e) => ({ tag: e.tagName, t: (e.textContent ?? '').trim().slice(0, 30), cls: (e.className ?? '').toString().slice(0, 60) }));
    return { res, fireVisible: vis.slice(0, 3) };
  });
  // desktop: fire başlığı var mı
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const p2 = await ctx2.newPage();
  await openRoute(p2, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
  out.desktop_fire = await p2.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => (e.textContent ?? '').trim() === 'Fire %').map((e) => ({ tag: e.tagName, cls: (e.className ?? '').toString().slice(0, 60) })));
  await ctx.close(); await ctx2.close();
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
run().catch((e) => { console.error(e); process.exit(1); });

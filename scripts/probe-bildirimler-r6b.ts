import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
const base = defaultBaseUrl();
const FN = `(() => {
  const scope = document.querySelector('main') || document.body;
  const out = [];
  scope.querySelectorAll('*').forEach((el) => {
    const has = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!has) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    out.push({ px: Math.round(parseFloat(cs.fontSize)), w: cs.fontWeight, tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,50), text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40) });
  });
  return out;
})()`;
async function run(route: string, as: string, w: number, h: number) {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  await openRoute(p, { route, as, base, dark: false });
  const r = await p.evaluate(FN);
  console.log('==', route, as, w + 'x' + h);
  console.log(JSON.stringify(r, null, 0));
  await b.close();
}
(async () => {
  await run('/bildirimler', 'depo', 1440, 900);
  await run('/onaylar', 'admin', 1440, 900);
})();

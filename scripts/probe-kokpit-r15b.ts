/** Tur 15 kokpit prob (b): rozet anatomisi + kolon dibi + KPI şerit genişliği (data-status / kpi kökü). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r15');
const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const badges = Array.from(main.querySelectorAll('span[data-status]')).filter(vis).map((b) => {
    const cs = getComputedStyle(b);
    let sec = b.closest('section') || b.closest('div[class*="rounded"]');
    let title = '';
    let n = b;
    while (n && n !== main) { const h = n.querySelector && n.querySelector('h2,h3'); if (h) { title = h.textContent.trim(); break; } n = n.parentElement; }
    return { t: (b.textContent||'').trim(), status: b.getAttribute('data-status'), bg: cs.backgroundColor, h: r1(b.getBoundingClientRect().height), fz: cs.fontSize, card: title.slice(0,40) };
  });
  // kolon dibi: main > div grid çocukları
  const grids = Array.from(main.querySelectorAll('div')).filter((d) => getComputedStyle(d).display === 'grid' && d.children.length >= 2 && d.getBoundingClientRect().width > 600);
  const cols = grids.slice(0,2).map((g) => ({ w: r1(g.getBoundingClientRect().width), children: Array.from(g.children).map((c)=>({ bottom: r1(c.getBoundingClientRect().bottom), h: r1(c.getBoundingClientRect().height), w: r1(c.getBoundingClientRect().width) })) }));
  return { badges, cols, mainW: r1(main.getBoundingClientRect().width) };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const role of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/kokpit', as: role, base });
    out[role] = await page.evaluate(SRC);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(resolve(OUT, 'probe-r15b.json'), JSON.stringify(out, null, 2));
  console.log('yazıldı');
}
main();

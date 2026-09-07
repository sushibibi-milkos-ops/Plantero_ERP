/** Tur 16 kokpit prob (c): kolon dibi dengesi (BalancedGrid columns-2 dahil) + KPI şerit bandı. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r16');
const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const secs = Array.from(main.querySelectorAll('section')).filter(vis).map((s) => {
    const b = s.getBoundingClientRect();
    const h = s.querySelector('h2,h3');
    return { title: (h ? h.textContent : '').replace(/\\s+/g,' ').trim().slice(0,30), left: r1(b.left), right: r1(b.right), top: r1(b.top), bottom: r1(b.bottom), w: r1(b.width) };
  });
  // kolonlara ayır: sol yarı / sağ yarı
  const mb = main.getBoundingClientRect();
  const mid = mb.left + mb.width / 2;
  const leftCol = secs.filter((s) => s.right <= mid + 4 && s.w < mb.width * 0.7);
  const rightCol = secs.filter((s) => s.left >= mid - 4 && s.w < mb.width * 0.7);
  const full = secs.filter((s) => s.w >= mb.width * 0.7);
  const colSpread = (leftCol.length && rightCol.length)
    ? r1(Math.abs(Math.max(...leftCol.map(s=>s.bottom)) - Math.max(...rightCol.map(s=>s.bottom))))
    : null;
  // KPI şerit bandı
  const kpiLinks = Array.from(main.querySelectorAll('a,button')).filter((el)=>vis(el) && el.getBoundingClientRect().height >= 70 && el.getBoundingClientRect().height <= 90 && el.getBoundingClientRect().top < 400);
  let strip = null;
  if (kpiLinks.length >= 2) {
    const p = kpiLinks[0].parentElement.getBoundingClientRect();
    const rs = kpiLinks.map(e=>e.getBoundingClientRect());
    strip = { n: kpiLinks.length, widths: rs.map(r=>r1(r.width)), sum: r1(rs.reduce((a,r)=>a+r.width,0)), parentW: r1(p.width), lastRight: r1(Math.max(...rs.map(r=>r.right))), parentRight: r1(p.right), pct: r1(rs.reduce((a,r)=>a+r.width,0)/p.width*100) };
  }
  return { mainW: r1(mb.width), leftBottom: leftCol.length? r1(Math.max(...leftCol.map(s=>s.bottom))):null, rightBottom: rightCol.length? r1(Math.max(...rightCol.map(s=>s.bottom))):null, colSpread, leftTitles: leftCol.map(s=>s.title), rightTitles: rightCol.map(s=>s.title), fullTitles: full.map(s=>s.title), strip, docH: r1(document.documentElement.scrollHeight) };
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
  writeFileSync(resolve(OUT, 'probe-r16c.json'), JSON.stringify(out, null, 2));
  console.log('yazıldı');
}
main();

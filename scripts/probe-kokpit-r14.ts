/**
 * Tur 13 kokpit prob: açık bulguların yeniden ölçümü.
 *  - kokpit-focus-ring-dialect-10 (C8): main içindeki odak duraklarında focus-visible ring vs UA outline
 *  - kokpit-satis-kpi-band-width-10 (C2): KPI şeridi toplam genişlik / içerik genişliği
 *  - kokpit-wo-badge-anatomy-10 (C11): "Son iş emirleri" rozet dolgu sayımı
 *  - kolon dibi dengesi, StatStrip anatomisi
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r14');
const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const mb = main.getBoundingClientRect();

  const kpiCards = Array.from(main.querySelectorAll('[data-slot="kpi-card"],[data-kpi-card]')).filter(vis);
  let kpiStrip = null;
  if (kpiCards.length) {
    const parent = kpiCards[0].parentElement;
    const pb = parent.getBoundingClientRect();
    const rects = kpiCards.map((c) => c.getBoundingClientRect());
    kpiStrip = {
      count: kpiCards.length,
      parentW: r1(pb.width),
      cardWidths: rects.map((r) => r1(r.width)),
      sum: r1(rects.reduce((a, r) => a + r.width, 0)),
      lastRight: r1(Math.max(...rects.map((r) => r.right))),
      parentRight: r1(pb.right),
      flexGrow: kpiCards.map((c) => getComputedStyle(c).flexGrow),
      pct: r1((rects.reduce((a, r) => a + r.width, 0) / pb.width) * 100),
    };
  }

  const focusables = Array.from(main.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"]),input,select,textarea')).filter(vis);
  const fs = focusables.map((el) => {
    const cls = (typeof el.className === 'string' ? el.className : '');
    const b = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,36), ring: /focus-visible:ring/.test(cls), w: r1(b.width), h: r1(b.height) };
  });
  const focusSummary = { total: fs.length, withRing: fs.filter(f=>f.ring).length, withoutRing: fs.filter(f=>!f.ring) };

  // Rozet anatomisi: her bölüm için dolgulu/dolgusuz rozet sayımı
  const sections = Array.from(main.querySelectorAll('section,[data-slot="card"]')).filter(vis);
  const badgeAnatomy = [];
  for (const s of sections) {
    const title = (s.querySelector('h2,h3')||{}).textContent || '';
    const badges = Array.from(s.querySelectorAll('[data-slot="status-badge"],[data-status-badge]')).filter(vis);
    if (!badges.length) continue;
    const info = badges.map((b)=>{ const cs=getComputedStyle(b); return { t:(b.textContent||'').trim().slice(0,24), bg:cs.backgroundColor, h:r1(b.getBoundingClientRect().height), fz:cs.fontSize }; });
    const filled = info.filter(i=>i.bg && i.bg!=='rgba(0, 0, 0, 0)' && i.bg!=='transparent');
    badgeAnatomy.push({ title: title.replace(/\\s+/g,' ').trim().slice(0,40), total: info.length, filled: filled.length, unfilled: info.length-filled.length, sample: info });
  }

  // sütun dibi
  const grid = main.querySelector('[data-slot="dashboard-grid"]');
  let columns = null;
  if (grid) {
    columns = Array.from(grid.children).map((c)=>({ bottom: r1(c.getBoundingClientRect().bottom), h: r1(c.getBoundingClientRect().height) }));
  }

  // tabular-nums olmayan sayı yaprakları
  const numLeaves = [];
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT);
  let n; let scanned = 0;
  while ((n = walk.nextNode()) && scanned < 3000) {
    scanned++;
    if (n.children.length) continue;
    const t = (n.textContent||'').trim();
    if (!/[0-9]/.test(t) || t.length > 40) continue;
    if (!vis(n)) continue;
    const cs = getComputedStyle(n);
    if (!/tabular-nums/.test(cs.fontVariantNumeric||'')) numLeaves.push({ t: t.slice(0,30), fz: cs.fontSize });
  }

  return { kpiStrip, focusSummary, badgeAnatomy, columns, nonTabular: numLeaves.slice(0,40), nonTabularCount: numLeaves.length, contentW: r1(mb.width) };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const role of ROLES) {
    out[role] = {};
    for (const vp of [{ width: 1440, height: 900, key: 'd' }, { width: 390, height: 844, key: 'm' }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.key === 'm', hasTouch: vp.key === 'm', locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/kokpit', as: role, base });
      (out[role] as Record<string, unknown>)[vp.key] = await page.evaluate(SRC);
      await ctx.close();
    }
  }
  await browser.close();
  writeFileSync(resolve(OUT, 'probe-r14.json'), JSON.stringify(out, null, 2));
  console.log('yazıldı');
}
main();

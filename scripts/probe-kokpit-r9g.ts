/**
 * Tur 9 kokpit prob-G: katlama üstü BİLGİ BİRİMİ sayımı (Tur 6/7 ile aynı tanım) —
 * ul>li satırları + KPI şeridi kartları + StatStrip hücreleri + Section içindeki div satırları.
 *   tsx scripts/probe-kokpit-r9g.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];
const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r9');

const SRC = `(() => {
  var main = document.querySelector('main') || document.body;
  var vh = window.innerHeight;
  var seen = [];
  var push = function (el, kind) {
    var r = el.getBoundingClientRect();
    if (r.bottom > vh || r.height < 8) return;
    seen.push({ kind: kind, t: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) });
  };
  Array.prototype.slice.call(main.querySelectorAll('ul > li')).forEach(function (el) { push(el, 'li'); });
  // KPI şerit kartları: 72/80px yüksekliğinde, başlık + değer taşıyan a/div
  Array.prototype.slice.call(main.querySelectorAll('a, div')).forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (Math.abs(r.height - 80) > 2 && Math.abs(r.height - 72) > 2) return;
    if (el.querySelector('ul, section')) return;
    var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!t || !/[0-9—]/.test(t)) return;
    push(el, 'kpi');
  });
  // StatStrip hücreleri + Section içi div satırları
  Array.prototype.slice.call(main.querySelectorAll('section div, [data-slot="card"] div')).forEach(function (el) {
    if (el.children.length === 0) return;
    if (el.querySelector('ul, section, h2, h3')) return;
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    if (r.height < 30 || r.height > 90) return;
    var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!t || !/[0-9]/.test(t)) return;
    // yalnızca yaprak-benzeri satır/hücre: içinde başka aday yoksa
    var inner = Array.prototype.slice.call(el.querySelectorAll('div')).some(function (d) {
      var rr = d.getBoundingClientRect(); return rr.height >= 30 && rr.height <= 90 && d.children.length > 0;
    });
    if (inner) return;
    if (cs.display === 'contents') return;
    push(el, 'cell');
  });
  var byKind = {};
  seen.forEach(function (s) { byKind[s.kind] = (byKind[s.kind] || 0) + 1; });
  return { total: seen.length, byKind: byKind, sample: seen.slice(0, 30) };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  mkdirSync(OUT, { recursive: true });
  try {
    for (const as of ROLES) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light' });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: '/kokpit', as });
      out[as] = await page.evaluate(SRC);
      await ctx.close();
      console.error(`✓ ${as}`);
    }
  } finally { await browser.close(); }
  writeFileSync(resolve(OUT, 'probe-r9g.json'), JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

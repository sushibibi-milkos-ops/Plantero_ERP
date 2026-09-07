/**
 * Tur 10 kokpit prob-F: katlama üstü bilgi birimi (kriter 3) + semantik renk sayısı (kriter 4).
 *   tsx scripts/probe-kokpit-r10f.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r10');
const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  const main = document.querySelector('main') || document.body;
  const vh = window.innerHeight;
  const inFold = (el) => { const b = el.getBoundingClientRect(); return b.top < vh && b.bottom > 0 && b.width > 0; };
  // bilgi birimi: liste satırı (ROW_BASE) + StatStrip hücresi + KPI kartı
  const rows = Array.from(main.querySelectorAll('a,div')).filter((el) => {
    const cs = getComputedStyle(el);
    return cs.display === 'flex' && cs.paddingLeft === '16px' && cs.fontSize === '13px' && inFold(el);
  }).length;
  const strips = Array.from(main.querySelectorAll('[class*="divide-x"] > *')).filter(inFold).length;
  const kpis = Array.from(main.querySelectorAll('[class*="overflow-x-auto"] > *')).filter(inFold).length;
  // semantik renkler: metin renklerinin doygun (nötr olmayan) olanları
  const hues = {};
  Array.from(main.querySelectorAll('*')).forEach((el) => {
    if (!inFold(el)) return;
    if (el.children.length > 0) return;
    if (!(el.textContent || '').trim()) return;
    const c = getComputedStyle(el).color;
    hues[c] = (hues[c] || 0) + 1;
  });
  const bgs = {};
  Array.from(main.querySelectorAll('*')).forEach((el) => {
    if (!inFold(el)) return;
    const b = getComputedStyle(el).backgroundColor;
    if (b === 'rgba(0, 0, 0, 0)') return;
    bgs[b] = (bgs[b] || 0) + 1;
  });
  return { foldRows: rows, foldStripCells: strips, foldKpis: kpis, foldUnits: rows + strips + kpis, textColors: hues, bgColors: bgs };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  mkdirSync(OUT, { recursive: true });
  const out: Record<string, unknown> = {};
  try {
    for (const as of ROLES) {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
        locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
      });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: '/kokpit', as });
      out[as] = await page.evaluate(SRC);
      await ctx.close();
      console.error(`✓ ${as}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r10f.json'), JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

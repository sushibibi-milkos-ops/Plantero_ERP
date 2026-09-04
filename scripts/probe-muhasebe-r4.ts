/** Tur 4 muhasebe ölçüm probu — scripts/measure.ts ile aynı giriş akışı, tek oturumda çok rota. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTES = process.argv.slice(2).filter((a) => a.startsWith('/'));

function collect() {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const vis = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const doc = document.documentElement;
  const scrollWidth = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
  const clientWidth = doc.clientWidth;

  // satırlar
  let rowEls = Array.from(document.querySelectorAll('tbody tr')).filter(vis);
  let rowKind = 'tr';
  if (!rowEls.length) { rowEls = Array.from(document.querySelectorAll('main ul > li, [role="list"] > li')).filter(vis); rowKind = 'li'; }
  const hs = rowEls.map((e) => r1(e.getBoundingClientRect().height)).sort((a, b) => a - b);
  const rows = { kind: rowKind, count: hs.length, min: hs[0] ?? 0, med: hs[Math.floor((hs.length - 1) / 2)] ?? 0, max: hs[hs.length - 1] ?? 0 };

  // iç yatay kaydırıcılar
  const innerScrollers = Array.from(document.querySelectorAll('main *')).filter((el) => {
    if (!vis(el)) return false;
    const cs = getComputedStyle(el);
    return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  }).map((el) => ({ cls: (el.className || '').toString().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth }));

  // kırpılan metinler (ellipsis uygulanmış ve gerçekten taşan)
  const clipped: Array<{ text: string; sw: number; cw: number }> = [];
  for (const el of Array.from(document.querySelectorAll('main span, main div, main td, main a')) as HTMLElement[]) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      clipped.push({ text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth });
    }
  }

  // th büyük harf
  const ths = Array.from(document.querySelectorAll('th')).filter(vis);
  const upperTh = ths.filter((t) => getComputedStyle(t).textTransform === 'uppercase').length;

  // ana içerik blok genişlikleri (kesin: main içindeki 1. seviye bölümler)
  const main = document.querySelector('main');
  const blockWidths: Array<{ tag: string; w: number; text: string }> = [];
  if (main) {
    const scan = (root: Element, depth: number) => {
      for (const c of Array.from(root.children)) {
        if (!vis(c)) continue;
        const w = r1(c.getBoundingClientRect().width);
        if (depth <= 2) blockWidths.push({ tag: c.tagName.toLowerCase() + '.' + (c.className || '').toString().split(' ').slice(0, 3).join('.'), w, text: (c.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30) });
        if (depth < 2) scan(c, depth + 1);
      }
    };
    scan(main, 0);
  }

  // dokunma hedefleri
  const inter = Array.from(document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="combobox"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'));
  const small = inter.filter(vis).map((el) => { const r = el.getBoundingClientRect(); return { s: (el.getAttribute('aria-label') || el.textContent || el.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 28), w: r1(r.width), h: r1(r.height) }; }).filter((x) => x.w < 44 || x.h < 44);

  // font boyutu dağılımı
  const fontSizes: Record<string, number> = {};
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    let hasText = false;
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.textContent ?? '').trim()) { hasText = true; break; }
    if (!hasText || !vis(el)) continue;
    const s = String(r1(parseFloat(getComputedStyle(el).fontSize)));
    fontSizes[s] = (fontSizes[s] ?? 0) + 1;
  }

  // renk sayısı
  const colors = new Set<string>();
  const tr = /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/;
  for (const el of Array.from(document.body.querySelectorAll('*')).slice(0, 400)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    if (cs.color && !tr.test(cs.color)) colors.add(cs.color);
    if (cs.backgroundColor && !tr.test(cs.backgroundColor)) colors.add(cs.backgroundColor);
  }

  // tabular-nums olmayan para hücreleri
  let moneyNoTabular = 0, moneyTotal = 0;
  for (const el of Array.from(document.querySelectorAll('main td, main span, main div')) as HTMLElement[]) {
    const t = (el.textContent ?? '').trim();
    if (!/^[-+−]?\s?[₺€$]\s?[\d.]+,\d{2}$/.test(t)) continue;
    if (el.children.length) continue;
    moneyTotal++;
    const fv = getComputedStyle(el).fontVariantNumeric || '';
    let node: HTMLElement | null = el; let ok = /tabular-nums/.test(fv);
    while (!ok && node && node !== document.body) { if (/tabular-nums/.test(getComputedStyle(node).fontVariantNumeric || '')) ok = true; node = node.parentElement; }
    if (!ok) moneyNoTabular++;
  }

  const h1El = Array.from(document.querySelectorAll('h1')).find(vis);
  const h1 = h1El ? { size: r1(parseFloat(getComputedStyle(h1El).fontSize)), weight: Number(getComputedStyle(h1El).fontWeight), text: (h1El.textContent ?? '').trim().slice(0, 40) } : null;

  return { scrollWidth, clientWidth, overflowX: scrollWidth > clientWidth, rows, innerScrollers, clipped, ths: ths.length, upperTh, blockWidths, touchBelow44: small, fontSizes, distinctColors: colors.size, moneyTotal, moneyNoTabular, h1 };
}

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const isMobile = vp.width < 768;
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile, hasTouch: isMobile, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      for (const route of ROUTES) {
        try {
          await openRoute(page, { base, route, as: 'admin' });
          const data = await page.evaluate(`(() => { const __name = (f) => f; return (${collect.toString()})(); })()`);
          out[`${route}@${vp.width}`] = data;
        } catch (e) {
          out[`${route}@${vp.width}`] = { error: (e as Error).message.slice(0, 120) };
        }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  process.stdout.write(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

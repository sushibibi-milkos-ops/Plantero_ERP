import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl(); const PO = process.env.PO_ID!;
async function main() {
  const browser = await launchBrowser(); const out: Record<string, any> = {};
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route: `/satin-alma/siparisler/${PO}`, as: 'satin_alma' });
    out.rows = await page.evaluate(() => Array.from(document.querySelectorAll('tbody tr')).map((tr) => Math.round(tr.getBoundingClientRect().height)));
    out.colors = await page.evaluate(() => {
      const seen = new Map<string, string[]>();
      for (const e of Array.from(document.querySelectorAll('main *'))) {
        const el = e as HTMLElement; if (el.children.length) continue;
        const t = (el.textContent ?? '').trim(); if (!t) continue;
        const r = el.getBoundingClientRect(); if (r.width <= 0) continue;
        const c = getComputedStyle(el).color;
        if (!seen.has(c)) seen.set(c, []);
        seen.get(c)!.push(t.slice(0, 18));
      }
      return Array.from(seen.entries()).map(([c, ts]) => ({ c, n: ts.length, sample: ts.slice(0, 5) }));
    });
    await ctx.close(); }
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route: `/satin-alma/siparisler/${PO}`, as: 'satin_alma' });
    out.mobileTotal = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0 && /Toplam \(KDV dahil\)|113\.040/.test(e.textContent ?? ''));
      return els.map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { t: (e.textContent ?? '').trim(), left: Math.round(r.left), right: Math.round(r.right), align: cs.textAlign, size: Math.round(parseFloat(cs.fontSize)) }; });
    });
    out.mobileMainBox = await page.evaluate(() => { const m = document.querySelector('main')!.getBoundingClientRect(); return { left: Math.round(m.left), right: Math.round(m.right) }; });
    await ctx.close(); }
  await browser.close(); writeFileSync('artifacts/critic/probe-tedarik-r5k.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1).slice(0, 3000));
}
main().catch((e) => { console.error(e); process.exit(1); });

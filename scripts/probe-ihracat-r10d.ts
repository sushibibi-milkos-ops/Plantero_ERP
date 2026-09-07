/** Tur 10d: sayı taşıyan YAPRAK elemanlarda tabular-nums / mono kontrolü. */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['kurlar', '/ihracat/kurlar'], ['gtip', '/ihracat/gtip'], ['belgeler', '/ihracat/belgeler']] as Array<[string, string]>) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    res[k] = await page.evaluate(() => {
      const out: any[] = [];
      document.querySelectorAll('table tbody td').forEach((td) => {
        // yaprak: metin taşıyan en derin eleman
        let leaf: Element = td;
        for (let i = 0; i < 8; i++) {
          const kids = Array.from(leaf.children).filter((c) => ((c as HTMLElement).textContent ?? '').trim());
          if (kids.length !== 1) break;
          leaf = kids[0];
        }
        const t = (leaf.textContent ?? '').trim();
        if (!/[0-9]/.test(t)) return;
        const cs = getComputedStyle(leaf);
        out.push({ t: t.slice(0, 20), fvn: cs.fontVariantNumeric, fam: cs.fontFamily.split(',')[0].replace(/["']/g, ''), align: getComputedStyle(td).textAlign });
      });
      const bad = out.filter((c) => !/tabular-nums/.test(c.fvn) && !/mono|Mono/.test(c.fam));
      // KPI değerleri
      const kpis: any[] = [];
      document.querySelectorAll('main *').forEach((el) => {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.fontSize) >= 22 && el.children.length === 0 && /[0-9]/.test(el.textContent ?? '')) kpis.push({ t: (el.textContent ?? '').trim(), size: cs.fontSize, fvn: cs.fontVariantNumeric, fam: cs.fontFamily.split(',')[0].replace(/["']/g, '') });
      });
      return { total: out.length, badCount: bad.length, bad: bad.slice(0, 8), kpis };
    });
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r10d.json', JSON.stringify(res, null, 1));
  console.error(JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]: any) => [k, { total: v.total, bad: v.badCount }]))));
}
main().catch((e) => { console.error(e); process.exit(1); });

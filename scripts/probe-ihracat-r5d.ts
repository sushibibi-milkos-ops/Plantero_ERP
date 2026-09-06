/** Tur 5: taslak sevkiyat detayında sıfır değer sunumu (renk/ağırlık) ölçümü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = process.argv[2]!;

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
  const out = await page.evaluate(() => {
    const res: Array<{ t: string; color: string; weight: string; size: string }> = [];
    for (const el of [...document.querySelectorAll('div,span,p')]) {
      if (el.children.length !== 0) continue;
      const t = (el.textContent || '').trim();
      if (!t) continue;
      if (/^(0 kap|1 kap · 1 palet|€0,00|—|— \/ —|₺2\.678,40|0 kap · 0 palet)$/.test(t) || /kap/.test(t)) {
        const cs = getComputedStyle(el);
        res.push({ t, color: cs.color, weight: cs.fontWeight, size: cs.fontSize });
      }
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  for (const [k, route] of [['kurlar', '/ihracat/kurlar'], ['sevkiyatlar', '/ihracat/sevkiyatlar'], ['gtip', '/ihracat/gtip']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    res[k] = await p.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 2);
      return rows.map((r) => Array.from(r.children).map((c) => {
        const target = (c.querySelector('*') as HTMLElement) ?? (c as HTMLElement);
        const cs = getComputedStyle(target);
        return { txt: (c.textContent ?? '').trim().slice(0, 16), ff: cs.fontFamily.split(',')[0].replace(/['"]/g, ''), fvn: cs.fontVariantNumeric, align: getComputedStyle(c as HTMLElement).textAlign };
      }));
    });
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r14e.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });

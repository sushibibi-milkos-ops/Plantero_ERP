import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  await openRoute(p, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
  const r = await p.evaluate(() => {
    const widths: Record<string, number[]> = {};
    document.querySelectorAll('table tbody tr').forEach((tr) => {
      const c = tr.children[0] as HTMLElement;
      const rng = document.createRange(); rng.selectNodeContents(c);
      const w = Math.round(rng.getBoundingClientRect().width * 100) / 100;
      const t = (c.textContent ?? '').trim();
      (widths[t] ??= []).push(w);
    });
    const all = Object.entries(widths).map(([t, w]) => [t, w[0]] as const);
    return { all, min: Math.min(...all.map((a) => a[1])), max: Math.max(...all.map((a) => a[1])) };
  });
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r14f.json', JSON.stringify(r, null, 1));
  console.error(JSON.stringify(r));
}
main().catch((e) => { console.error(e); process.exit(1); });

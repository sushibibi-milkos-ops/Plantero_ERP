/** Tur 23 (shell) — shell-qtycell-zero-tone-01 kapanış kanıtı: "Son iş emirleri" listesindeki 0 ADET
 *  hücrelerinin rengi MoneyCell'in soluk-sıfır tonuyla (oklch, /70) birebir aynı mı? */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const p = await ctx.newPage();
  await openRoute(p, { base: BASE, route: '/kokpit', as: 'uretim_sefi' });
  const data = await p.evaluate(`(() => {
    const spans = Array.from(document.querySelectorAll('span.num'));
    const rows = spans.map(s => ({ text: s.textContent.trim(), color: getComputedStyle(s).color }));
    return rows;
  })()`);
  writeFileSync('/home/user/Plantero_ERP/artifacts/critic/probe-shell-r23-qtycell.json', JSON.stringify(data, null, 1));
  console.log(JSON.stringify(data, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

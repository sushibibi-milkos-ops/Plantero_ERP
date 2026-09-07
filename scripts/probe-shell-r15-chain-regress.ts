/** Tur 15 (bu oturum) regresyon: chain.ts TYPE_RANK degisikliginden sonra DocumentChain'in diger
 * kullanim rotalarinda (satis siparisi, fatura, satin alma siparisi, sevkiyat, mal kabul) kart sirasi
 * hala kanonik mi (soldan saga artan TYPE_RANK)? */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();

const ROUTES: Array<{ route: string; as: string }> = [
  { route: '/satis/siparisler/0b5dd02d-6f08-4374-b2a4-86d5091a468a', as: 'admin' },
  { route: '/muhasebe/faturalar/cc78c35e-f6c9-4019-b5d0-e33b57cc62dc', as: 'admin' },
  { route: '/satin-alma/siparisler/e0e6f928-5bbc-417c-97e5-1849dd7a3746', as: 'admin' },
  { route: '/depo/sevkiyat/8599674d-22c2-43ce-8aed-6ebc1e775443', as: 'admin' },
  { route: '/depo/mal-kabul/4539b1b2-1add-42e5-8fa7-5f1495ba9e36', as: 'admin' },
];

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  const res: Record<string, unknown> = {};
  for (const r of ROUTES) {
    await openRoute(p, { base: BASE, route: r.route, as: r.as });
    res[r.route] = await p.evaluate(() =>
      Array.from(document.querySelectorAll('a[data-pressable], [data-slot]'))
        .filter((e) => (e as HTMLElement).className?.toString().includes('snap-start'))
        .map((a) => ({
          x: Math.round(a.getBoundingClientRect().left),
          label: (a.querySelector('span')?.textContent ?? '').trim(),
          docNo: ((a.textContent ?? '').match(/[A-Z]{2,4}-\d{4}-\d{6}/) ?? ['—'])[0],
        }))
        .sort((a, b) => a.x - b.x),
    );
  }
  writeFileSync('artifacts/critic/probe-shell-r15-chain-regress.json', JSON.stringify(res, null, 2));
  await ctx.close();
  await browser.close();
  console.error(JSON.stringify(res, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

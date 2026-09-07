/** Tur 16 regresyon: DocumentChain kart sırası diğer rotalarda kanonik mi (id'ler psql'den taze). */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const q = (sql: string) => execSync(`psql "${DB}" -t -A -c "${sql}"`, { encoding: 'utf8' }).trim().split('\n')[0];

async function main() {
  const routes = [
    `/satis/siparisler/${q('select id from sales_orders order by doc_no desc limit 1')}`,
    `/muhasebe/faturalar/${q("select id from invoices order by doc_no desc limit 1")}`,
    `/depo/sevkiyat/${q('select id from deliveries order by doc_no desc limit 1')}`,
  ];
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  const res: Record<string, unknown> = {};
  for (const route of routes) {
    await openRoute(p, { base: BASE, route, as: 'admin' });
    res[route] = await p.evaluate(() => Array.from(document.querySelectorAll('a[data-pressable], [data-slot]'))
      .filter((e) => (e as HTMLElement).className?.toString().includes('snap-start'))
      .map((a) => ({ x: Math.round(a.getBoundingClientRect().left), label: (a.querySelector('span')?.textContent ?? '').trim(), docNo: ((a.textContent ?? '').match(/[A-Z]{2,4}-\d{4}-\d{6}/) ?? ['—'])[0] }))
      .sort((a, b) => a.x - b.x));
  }
  writeFileSync('artifacts/critic/probe-shell-r16-chain-regress.json', JSON.stringify(res, null, 2));
  await ctx.close(); await browser.close();
  console.error(JSON.stringify(res));
}
main().catch((e) => { console.error(e); process.exit(1); });

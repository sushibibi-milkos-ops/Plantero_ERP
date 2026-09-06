import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const routes: Array<[string, string]> = [
  ['kritik-stok', '/satin-alma/kritik-stok'],
  ['onay-kuyrugu', '/satin-alma/onay-kuyrugu'],
  ['siparisler', '/satin-alma/siparisler'],
  ['po-detay', '/satin-alma/siparisler/1743a5bd-a194-4b90-a8e3-5b2f246c9b72'],
  ['yeni', '/satin-alma/siparisler/yeni'],
  ['tedarikciler', '/satin-alma/tedarikciler'],
];
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [k, route] of routes) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await c.newPage();
    const errs: string[] = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 160)));
    await openRoute(p, { base, route, as: 'admin' });
    await p.waitForTimeout(600);
    const info = await p.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('main *')).filter((e) => getComputedStyle(e).fontVariantNumeric.includes('tabular-nums')).length;
      const rows = Array.from(document.querySelectorAll('main tbody tr'));
      const clipped = Array.from(document.querySelectorAll('main *')).filter((e) => {
        const el = e as HTMLElement;
        return el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && el.children.length === 0;
      }).map((e) => ((e.textContent || '').trim().slice(0, 30) + ' [' + (e as HTMLElement).scrollWidth + '>' + (e as HTMLElement).clientWidth + ']'));
      return { tabularNums: tab, rowCount: rows.length, clipped: clipped.slice(0, 8) };
    });
    out[k] = { errors: errs, ...info };
    await c.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r12b.json', JSON.stringify(out, null, 1));
  console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });

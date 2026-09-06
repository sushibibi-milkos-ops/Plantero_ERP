import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: any[] = [];
  for (const route of ['/satin-alma/kritik-stok', '/satin-alma/siparisler']) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await c.newPage();
    p.on('response', (r) => { if (r.status() >= 400) out.push({ route, url: r.url(), status: r.status() }); });
    p.on('requestfailed', (r) => out.push({ route, url: r.url(), failed: r.failure()?.errorText }));
    await openRoute(p, { base, route, as: 'admin' });
    await p.waitForTimeout(1500);
    await c.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r12c.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

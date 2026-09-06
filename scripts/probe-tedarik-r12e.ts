import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  for (let i = 0; i < 3; i++) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const hits: string[] = [];
    c.on('response', (r) => { if (r.status() >= 400) hits.push(r.status() + ' ' + r.request().resourceType() + ' ' + r.url().slice(0, 140)); });
    const p = await c.newPage();
    const errs: string[] = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 100)); });
    await openRoute(p, { base, route: '/satin-alma/kritik-stok', as: 'admin' });
    await p.waitForTimeout(2500);
    console.log('run', i, 'console:', errs.length, 'http4xx:', JSON.stringify(hits));
    await c.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

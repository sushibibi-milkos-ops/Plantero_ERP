import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  for (let i = 0; i < 2; i++) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await c.newPage();
    const errs: string[] = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
    p.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 120)); });
    await openRoute(p, { base, route: '/satin-alma/kritik-stok', as: 'admin' });
    await p.waitForTimeout(2000);
    console.log('run', i, JSON.stringify(errs));
    await c.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

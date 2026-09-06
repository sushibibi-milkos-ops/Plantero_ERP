import { defaultBaseUrl, launchBrowser, login } from './lib/browser';

const base = defaultBaseUrl();
const route = process.argv[2] ?? '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler';
const vp = (process.argv[3] ?? '1440x900').split('x').map(Number);

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: vp[0]!, height: vp[1]! }, deviceScaleFactor: 1, ...(vp[0]! < 700 ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 400)));
  page.on('response', (r) => { if (r.status() >= 400) pageErrors.push(`HTTP ${r.status()} ${r.url().slice(0,200)}`); });
  page.setDefaultNavigationTimeout(120_000);
  await login(page, base, { email: 'admin@plantero.local', password: 'Plantero!2026' }, route);
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 120_000 });
  const samples: any[] = [];
  for (const t of [0, 1000, 3000, 6000, 12000]) {
    if (t) await page.waitForTimeout(t === 1000 ? 1000 : 2000 + (t > 3000 ? 2000 : 0));
    samples.push(await page.evaluate(() => ({
      skeletons: document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length,
      ariaBusy: document.querySelectorAll('[aria-busy="true"]').length,
      hasMoney: document.body.innerText.includes('₺103,41'),
      text: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
    })));
  }
  console.log(JSON.stringify({ route, vp: vp.join('x'), samples, pageErrors, consoleErrors: consoleErrors.slice(0, 15) }, null, 1));
  await browser.close();

}
main();

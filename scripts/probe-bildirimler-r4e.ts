import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  const orders: string[][] = [];
  await openRoute(page, { base, route: '/onaylar', as: 'admin' });
  for (let i = 0; i < 4; i++) {
    if (i > 0) { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400); }
    const o = (await page.evaluate(`(() => Array.from(document.querySelectorAll('[role="option"]')).map(r => (r.querySelector('span.truncate')||{textContent:''}).textContent.slice(0,26)))()`)) as string[];
    orders.push(o);
  }
  const stable = orders.every((o) => JSON.stringify(o) === JSON.stringify(orders[0]));
  console.log(JSON.stringify({ stable, orders }, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

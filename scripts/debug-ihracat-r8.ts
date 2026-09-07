import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = 'b15d0813-8995-4117-b809-3fe23e54f236';

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
  await page.waitForTimeout(1500);
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent));
  console.log('TABS', tabs);
  const tableCount = await page.evaluate(() => document.querySelectorAll('table').length);
  console.log('TABLE COUNT', tableCount);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('BODY', bodyText);
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

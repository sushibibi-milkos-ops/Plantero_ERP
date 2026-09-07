import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTE = '/arge/projeler/501ef0c7-3273-43ae-9a81-15563cff78a9/receteler';

async function main() {
  const browser = await launchBrowser();

  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    await page.getByRole('button', { name: /^v1/ }).first().click();
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'artifacts/critic/arge-t6-v1-1440.png' });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    await page.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole('option', { name: /v1/ }).first().click();
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'artifacts/critic/arge-t6-v1-390.png', fullPage: true });
    await ctx.close();
  }

  await browser.close();
}
main();

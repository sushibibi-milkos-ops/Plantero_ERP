import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/onaylar', as: 'arge' });
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Onayla' }).first().click();
    await page.waitForTimeout(1500);
    const stillThere = await page.getByText('Reçete devri onayı').count();
    console.log('Onay sonrası kuyrukta hâlâ görünüyor mu (0 beklenir):', stillThere);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

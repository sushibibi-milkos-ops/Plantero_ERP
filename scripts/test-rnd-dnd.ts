import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/projeler/349115b7-72d7-4679-991b-c5b2844660f5/board', as: 'arge' });

    const source = page.getByText('v1 taban formülasyon (mevcut BOM)');
    const sourceBox = await source.boundingBox();
    const targetCol = page.getByText('Pilot Üretim').first();
    const targetBox = await targetCol.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('Kart veya kolon bulunamadı');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 20, sourceBox.y + sourceBox.height / 2 + 10, { steps: 5 });
    await page.mouse.move(targetBox.x + 50, targetBox.y + 100, { steps: 15 });
    await page.mouse.move(targetBox.x + 50, targetBox.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    await page.waitForTimeout(500);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

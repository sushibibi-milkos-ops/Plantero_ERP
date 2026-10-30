import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './fixtures/auth';

/**
 * Ürün ağacı akış şeması: reçete detayında ve ürün kartının Reçete sekmesinde render olur,
 * düğüm sayısı reçete satır sayısından az değildir, mobilde (375px) sayfa yatay taşmaz.
 * Veri: seed'deki ilk reçete (kimliğe bağımlı değil).
 */
/** Reçete listesindeki satır kimlikleri (DataTable `data-row-id`) */
async function bomIds(page: Page): Promise<string[]> {
  await page.goto('/ana-veri/receteler');
  await expect(page.locator('[data-row-id]').first()).toBeVisible();
  return page.locator('[data-row-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-row-id') ?? ''));
}

test.describe('Ürün ağacı akış şeması', () => {
  test('reçete detayı → ağaç render; ürün kartı ?tab=recete → aynı ağaç', async ({ page }) => {
    await loginAs(page, 'admin');
    const [firstId] = await bomIds(page);
    await page.goto(`/ana-veri/receteler/${firstId}`);

    await page.getByRole('tab', { name: 'Ürün ağacı' }).click();
    const flow = page.getByTestId('bom-flow');
    await expect(flow).toBeVisible();
    const lineCount = Number(await flow.getAttribute('data-line-count'));
    expect(lineCount).toBeGreaterThan(0);
    // En az bir süreç düğümü + malzeme/ürün düğümleri (≥ satır sayısı)
    await expect(page.getByTestId('bom-process').first()).toBeVisible();
    expect(await page.getByTestId('bom-node').count()).toBeGreaterThanOrEqual(lineCount);

    // Ürün kartına geç: aynı ağaç Reçete sekmesinin en üstünde
    const productHref = await page.locator('a[href^="/ana-veri/urunler/"]').first().getAttribute('href');
    expect(productHref).toMatch(/^\/ana-veri\/urunler\/[0-9a-f-]{36}$/);
    await page.goto(`${productHref}?tab=recete`);
    const flow2 = page.getByTestId('bom-flow');
    await expect(flow2).toBeVisible();
    expect(await page.getByTestId('bom-node').count()).toBeGreaterThanOrEqual(Number(await flow2.getAttribute('data-line-count')));
  });

  test('mobil 375px: yatay taşma yok, düğümler görünür', async ({ page }) => {
    await loginAs(page, 'admin');
    const [firstId] = await bomIds(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/ana-veri/receteler/${firstId}?tab=agac`);
    const flow = page.getByTestId('bom-flow');
    await expect(flow).toBeVisible();
    await expect(page.getByTestId('bom-node').first()).toBeVisible();
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - window.innerWidth,
      flow: (() => {
        const el = document.querySelector('[data-testid="bom-flow"]') as HTMLElement | null;
        const sc = el?.querySelector('.overflow-x-auto') as HTMLElement | null;
        return sc ? sc.scrollWidth - sc.clientWidth : 0;
      })(),
    }));
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.flow).toBeLessThanOrEqual(0);
  });

  test('yarı mamul düğümü alt ağacı daralt/genişlet', async ({ page }) => {
    await loginAs(page, 'admin');
    test.setTimeout(150_000);
    const ids = await bomIds(page);
    // Önce çok bileşenli (yarı mamullü olma olasılığı yüksek) ilk 12 reçete taranır; yoksa test atlanır.
    for (const id of ids.slice(0, 12)) {
      await page.goto(`/ana-veri/receteler/${id}?tab=agac`);
      const toggle = page.getByRole('button', { name: /alt ağacını daralt$/ }).first();
      if (await toggle.count()) {
        await toggle.click();
        await expect(page.getByRole('button', { name: /alt ağacını genişlet$/ }).first()).toHaveAttribute('aria-expanded', 'false');
        return;
      }
    }
    test.skip(true, 'Seed verisinde çok seviyeli (yarı mamullü) reçete yok');
  });
});

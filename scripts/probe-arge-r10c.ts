/** Tur 10 kritik — klavye aktivasyon animasyonu, odak halkası, boş durum. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });

  // Kanban kartına klavye ile odaklan
  const card = page.locator('button', { hasText: 'Pazar araştırması' }).first();
  await card.focus();
  const focusStyle = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { boxShadow: cs.boxShadow, outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, transform: cs.transform };
  });
  await page.keyboard.down(' ');
  await page.waitForTimeout(90);
  const pressed = await card.evaluate((el) => ({ transform: getComputedStyle(el).transform, matchesFV: el.matches(':focus-visible'), matchesActive: el.matches(':active') }));
  await page.keyboard.up(' ');
  out.boardCardKeyboard = { focusStyle, pressed };

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Boş durum: /arge/receteler'de eşleşmeyen arama
  await page.goto(`${base}/arge/receteler`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const search = page.locator('input[aria-label="Tabloda ara"]');
  await search.fill('zzzz-yok');
  await page.waitForTimeout(600);
  out.emptyState = await page.evaluate(() => {
    const main = document.querySelector('main');
    const txt = (main?.textContent ?? '').replace(/\s+/g, ' ');
    const svgs = main?.querySelectorAll('svg').length ?? 0;
    const btns = [...(main?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()).filter(Boolean);
    return { text: txt.slice(0, 400), svgs, btns };
  });
  await page.screenshot({ path: 'artifacts/critic/arge-r10-bos-1440.png', clip: { x: 340, y: 60, width: 1100, height: 460 } });

  await ctx.close();
  await browser.close();
  console.log(JSON.stringify(out));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

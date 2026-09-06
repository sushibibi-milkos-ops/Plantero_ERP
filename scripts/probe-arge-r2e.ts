import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PID = '3decd113-2b89-4d42-a150-5079cb2c1651';
async function main() {
  const browser = await launchBrowser();
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
  const page = await c.newPage();
  await openRoute(page, { route: `/arge/projeler/${PID}/receteler`, as: 'admin', base });
  const btns = await page.evaluate(() => Array.from(document.querySelectorAll('main button')).map((b) => (b as HTMLElement).innerText.replace(/\n/g, '|')).slice(0, 12));
  await page.getByRole('button', { name: /v1/ }).first().click();
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => ({
    hoverMedia: matchMedia('(hover: hover)').matches,
    tableRows: document.querySelectorAll('tbody tr').length,
    tableControls: Array.from(document.querySelectorAll('tbody input, tbody button')).slice(0, 6).map((e) => { const s = getComputedStyle(e as HTMLElement); const r = e.getBoundingClientRect(); return { tag: e.tagName, h: Math.round(r.height), border: s.borderTopWidth + ' ' + s.borderTopColor, bg: s.backgroundColor }; }),
    controlsBelow44: Array.from(document.querySelectorAll('main input, main button')).filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 44; }).length,
  }));
  await page.screenshot({ path: 'artifacts/critic/arge-r2-precete-v1-390.png', fullPage: true, animations: 'disabled' });
  await c.close();
  await browser.close();
  process.stdout.write(JSON.stringify({ btns, res }));
}
main().catch((e) => { console.error(e); process.exit(1); });

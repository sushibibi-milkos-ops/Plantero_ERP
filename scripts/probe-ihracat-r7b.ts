import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  // boş sonuç
  await page.getByLabel('Tabloda ara').fill('zzzzzz');
  await page.waitForTimeout(900);
  const empty = await page.evaluate(() => {
    const m = document.querySelector('main');
    const t = (m?.textContent ?? '').replace(/\s+/g, ' ');
    const svgs = m?.querySelectorAll('svg').length ?? 0;
    return { text: t.slice(0, 400), svgs };
  });
  await page.screenshot({ path: 'artifacts/critic/ihracat-r7-bos-1440.png', fullPage: false });
  await page.getByLabel('Tabloda ara').fill('');
  await page.waitForTimeout(700);
  // satır hover + focus
  const rowInfo = await page.evaluate(() => {
    const tr = document.querySelector('main tbody tr') as HTMLElement | null;
    if (!tr) return null;
    const link = tr.querySelector('a') as HTMLElement | null;
    return { trClass: tr.className, linkClass: link?.className ?? null, tabindex: tr.getAttribute('tabindex'), h: tr.getBoundingClientRect().height };
  });
  // klavye odağı
  await page.keyboard.press('Tab');
  const focusRing = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className?.toString().slice(0,120), outline: cs.outlineWidth + ' ' + cs.outlineStyle, boxShadow: cs.boxShadow.slice(0,80) };
  });
  console.log(JSON.stringify({ empty, rowInfo, focusRing }, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e)=>{console.error(e);process.exit(1);});

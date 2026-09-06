import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PID = '3decd113-2b89-4d42-a150-5079cb2c1651';
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await c.newPage();
    await openRoute(page, { route: '/arge/receteler', as: 'admin', base });
    out.receteler390 = await page.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement;
      const items = Array.from(main.querySelectorAll('li')) as HTMLElement[];
      return items.slice(0, 3).map((i) => ({ text: i.innerText.replace(/\n/g, ' ⏎ '), h: Math.round(i.getBoundingClientRect().height) }));
    });
    await c.close();
  }
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await c.newPage();
    await openRoute(page, { route: `/arge/projeler/${PID}/receteler`, as: 'admin', base });
    out.deltaColors = await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('p')).find((x) => x.textContent?.includes('e göre fark'))!;
      return Array.from(p.querySelectorAll('*')).map((e) => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 70), txt: (e as HTMLElement).innerText, color: getComputedStyle(e).color }));
    });
    out.qtyColumn = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.map((r) => {
        const td = r.children[1] as HTMLElement;
        const inp = td?.querySelector('input') as HTMLInputElement | null;
        return { value: inp?.value ?? td?.innerText, align: getComputedStyle(inp ?? td).textAlign, fv: getComputedStyle(inp ?? td).fontVariantNumeric };
      });
    });
    out.scrapColumn = await page.evaluate(() => Array.from(document.querySelectorAll('tbody tr')).map((r) => (r.children[4] as HTMLElement)?.querySelector('input')?.value ?? (r.children[4] as HTMLElement)?.innerText));
    await c.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });

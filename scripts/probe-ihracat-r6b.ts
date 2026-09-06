import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const CLOSED = '6224ef76-6704-4b62-9bf3-727d67e44180';
const CUSTOMS = '58c7a641-7817-4787-8aa2-60cc0f060e59';

async function main() {
  const browser = await launchBrowser();
  const out: any = {};

  // 1) chain currency on closed shipment (desktop)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${CLOSED}`, as: 'admin' });
    out.chainClosed = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('a[href*="/"] .code')).map((c) => c.parentElement!) as HTMLElement[];
      return cards.map((c) => ({ text: (c.innerText || '').replace(/\n/g, ' | ') }));
    });
    await page.getByRole('tab', { name: 'Fatura & kur' }).first().click();
    await page.waitForTimeout(400);
    out.invoicePanel = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h2,h3')).find((e) => e.textContent?.includes('İhracat faturası'));
      return (h?.parentElement?.innerText || '').replace(/\n/g, ' | ');
    });
    out.fxPanelClosed = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h2,h3')).find((e) => e.textContent?.includes('Kur bilgisi'));
      return (h?.parentElement?.innerText || '').replace(/\n/g, ' | ');
    });
    await ctx.close();
  }

  // 2) fx date on customs shipment
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${CUSTOMS}`, as: 'admin' });
    await page.getByRole('tab', { name: 'Fatura & kur' }).first().click();
    await page.waitForTimeout(400);
    out.fxPanelCustoms = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h2,h3')).find((e) => e.textContent?.includes('Kur bilgisi'));
      return (h?.parentElement?.innerText || '').replace(/\n/g, ' | ');
    });
    out.chainCustoms = await page.evaluate(() => Array.from(document.querySelectorAll('a .code')).map((c) => (c.parentElement!.innerText || '').replace(/\n/g, ' | ')));
    // hover + focus feedback on row
    await ctx.close();
  }

  // 3) kurlar table: latest rows text
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
    out.kurlarTop = await page.evaluate(() => Array.from(document.querySelectorAll('tbody tr')).slice(0, 4).map((r) => (r as HTMLElement).innerText.replace(/\n/g, ' | ')));
    // last column slack
    out.kurlarCols = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('thead th')) as HTMLElement[];
      const tbl = document.querySelector('table') as HTMLElement;
      return { tableW: Math.round(tbl.getBoundingClientRect().width), cols: ths.map((t) => ({ h: t.innerText.trim(), w: Math.round(t.getBoundingClientRect().width), x: Math.round(t.getBoundingClientRect().x) })) };
    });
    await ctx.close();
  }

  // 4) /yeni combobox option height (mobile)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar/yeni', as: 'admin' });
    const trig = page.getByRole('combobox').first();
    await trig.click();
    await page.waitForTimeout(500);
    out.comboOptions = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
      return opts.slice(0, 5).map((o) => ({ t: o.innerText.replace(/\n/g, ' | '), h: Math.round(o.getBoundingClientRect().height * 10) / 10 }));
    });
    await ctx.close();
  }

  // 5) gtip table column geometry (desktop) — slack
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: '/ihracat/gtip', as: 'admin' });
    out.gtipCols = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('thead th')) as HTMLElement[];
      const cells = Array.from(document.querySelectorAll('tbody tr:first-child td')) as HTMLElement[];
      return ths.map((t, i) => {
        const c = cells[i];
        const inner = c?.firstElementChild as HTMLElement | undefined;
        return { h: t.innerText.trim(), w: Math.round(t.getBoundingClientRect().width), contentW: inner ? Math.round(inner.getBoundingClientRect().width) : null, txt: c?.innerText.slice(0, 20) };
      });
    });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

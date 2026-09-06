import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

function probe() {
  const r = (n: number) => Math.round(n * 10) / 10;
  // "En çok satan 5" satırlarındaki ürün adı genişliği
  const names: unknown[] = [];
  for (const li of Array.from(document.querySelectorAll('main li'))) {
    const t = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
    const span = li.querySelector('span.truncate') as HTMLElement | null;
    if (!span) continue;
    names.push({ row: t.slice(0, 40), nameW: r(span.getBoundingClientRect().width), nameSW: span.scrollWidth, truncated: span.scrollWidth > span.clientWidth + 1, liH: r(li.getBoundingClientRect().height) });
  }
  // 44px altı gerçek etkileşimli hedefler (breadcrumb-page hariç)
  const small: unknown[] = [];
  for (const el of Array.from(document.querySelectorAll('main a[href], main button'))) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    if (b.height < 44) small.push({ text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32), w: r(b.width), h: r(b.height) });
  }
  const bc = document.querySelector('[data-slot="breadcrumb-page"]');
  return { names, small, breadcrumb: bc ? { tag: bc.tagName, role: bc.getAttribute('role'), href: bc.getAttribute('href'), tabindex: bc.getAttribute('tabindex') } : null };
}

async function main() {
  const as = process.argv[2] ?? 'admin';
  const w = Number(process.argv[3] ?? 390);
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: w < 768, hasTouch: w < 768, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as });
  console.log(JSON.stringify(await page.evaluate(`(() => { const __name=(f)=>f; return (${probe.toString()})(); })()`), null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

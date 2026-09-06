import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

function probe() {
  const r = (n: number) => Math.round(n * 10) / 10;
  const out: unknown[] = [];
  for (const el of Array.from(document.querySelectorAll('number-flow-react, [data-slot="number-flow"], number-flow'))) {
    const host = el as HTMLElement;
    const parent = host.parentElement as HTMLElement;
    const sr = (host as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
    const inner = sr ? (sr.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
    out.push({
      tag: host.tagName.toLowerCase(),
      label: (parent?.parentElement?.querySelector('div')?.textContent ?? '').trim().slice(0, 30),
      shadowText: inner.slice(0, 40),
      aria: host.getAttribute('aria-label') ?? host.getAttribute('title') ?? '',
      hostW: r(host.getBoundingClientRect().width),
      parentCW: parent?.clientWidth,
      parentSW: parent?.scrollWidth,
      parentOverflow: getComputedStyle(parent).overflow,
      clipped: (parent?.scrollWidth ?? 0) > (parent?.clientWidth ?? 0) + 1,
      fs: r(parseFloat(getComputedStyle(parent).fontSize)),
    });
  }
  return out;
}

async function main() {
  const as = process.argv[2] ?? 'admin';
  const w = Number(process.argv[3] ?? 1440);
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, isMobile: w < 768, hasTouch: w < 768, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/kokpit', as });
  console.log(JSON.stringify(await page.evaluate(`(() => { const __name=(f)=>f; return (${probe.toString()})(); })()`), null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

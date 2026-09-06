/** Tur 5 — sol-alt koyu daire kimliği + KPI şeridi mobil taşması (/bakim/makineler, /bakim/oee). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const el = document.elementFromPoint(28, window.innerHeight - 40);
  const cs = el ? getComputedStyle(el) : null;
  const r = el ? el.getBoundingClientRect() : null;
  const devOverlay = document.querySelector('nextjs-portal, [data-nextjs-dev-tools-button], #__next-dev-tools-indicator, [data-nextjs-toast]');
  const scrollers = Array.from(document.querySelectorAll<HTMLElement>('main div')).filter((d) => d.scrollWidth > d.clientWidth + 2).slice(0, 6).map((d) => ({
    cls: (d.getAttribute('class') || '').slice(0, 90), sw: d.scrollWidth, cw: d.clientWidth,
  }));
  const kpiCards = Array.from(document.querySelectorAll<HTMLElement>('main [class*="border-l"]')).slice(0, 8).map((d) => ({
    text: (d.textContent || '').trim().slice(0, 24), left: Math.round(d.getBoundingClientRect().left), right: Math.round(d.getBoundingClientRect().right), h: Math.round(d.getBoundingClientRect().height),
  }));
  return {
    bottomLeft: el ? { tag: el.tagName, id: el.id, cls: (el.getAttribute('class') || '').slice(0, 90), bg: cs!.backgroundColor, w: Math.round(r!.width), h: Math.round(r!.height), text: (el.textContent || '').trim().slice(0, 30) } : null,
    devOverlayTag: devOverlay ? devOverlay.tagName : null,
    scrollers,
    kpiCards,
    innerWidth: window.innerWidth,
  };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const route of ['/bakim/makineler', '/bakim/oee']) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await context.newPage();
      await openRoute(page, { route, base, as: 'admin' });
      out[`${route} ${vp.width}`] = await page.evaluate(collect);
      await context.close();
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

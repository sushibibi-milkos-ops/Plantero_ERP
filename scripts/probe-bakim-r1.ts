import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const routes = [
  { r: '/bakim/planlar', vp: { width: 1440, height: 900 } },
  { r: '/bakim/is-emirleri', vp: { width: 1440, height: 900 } },
  { r: '/bakim/makineler', vp: { width: 1440, height: 900 } },
  { r: '/bakim/oee', vp: { width: 390, height: 844 } },
  { r: '/bakim/oee', vp: { width: 1440, height: 900 } },
  { r: '/bakim/makineler/0c0682dc-f807-42b5-96cd-cb85fa51025e', vp: { width: 390, height: 844 } },
];

const collect = () => {
  const out: any[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('main, main *'))) {
    if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 100) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'visible') continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 110),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowX: cs.overflowX,
        text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 50),
      });
    }
  }
  const main = document.querySelector('main');
  const vh = window.innerHeight;
  let lastBottom = 0;
  if (main) for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0 && r.bottom > lastBottom && r.bottom < 100000) lastBottom = r.bottom;
  }
  return { overflows: out, lastContentBottom: Math.round(lastBottom), viewportHeight: vh, emptyBelow: Math.round(vh - lastBottom) };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (const { r, vp } of routes) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await openRoute(page, { route: r, base, as: 'admin' });
    const res = await page.evaluate(collect);
    console.log(JSON.stringify({ route: r, vp: `${vp.width}x${vp.height}`, ...res }));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

/** Tur 10 kritik — reçete detay 390px eylem şeridi + 1440 picker kenarlık teyidi. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    out.strip390 = await page.evaluate(() => {
      const sel = document.querySelector('button[data-slot="select-trigger"]') as HTMLElement;
      let strip: HTMLElement | null = sel;
      // en yakın, 3+ buton içeren üst kap
      while (strip && strip.querySelectorAll('button').length < 3) strip = strip.parentElement;
      const r = strip!.getBoundingClientRect();
      const btns = [...strip!.querySelectorAll('button')].map((b) => {
        const br = b.getBoundingClientRect();
        return {
          label: b.getAttribute('aria-label') ?? (b.textContent ?? '').trim().slice(0, 24),
          w: Math.round(br.width),
          h: Math.round(br.height),
          left: Math.round(br.left),
          right: Math.round(br.right),
          overflowRight: Math.round(Math.max(0, br.right - r.right)),
        };
      });
      return { sw: strip!.scrollWidth, cw: strip!.clientWidth, rect: { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }, btns, cls: strip!.className.slice(0, 120) };
    });
    // 375px kontrol
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    out.strip375 = await page.evaluate(() => {
      const sel = document.querySelector('button[data-slot="select-trigger"]') as HTMLElement;
      let strip: HTMLElement | null = sel;
      while (strip && strip.querySelectorAll('button').length < 3) strip = strip.parentElement;
      const r = strip!.getBoundingClientRect();
      return {
        sw: strip!.scrollWidth,
        cw: strip!.clientWidth,
        docSw: document.documentElement.scrollWidth,
        docCw: document.documentElement.clientWidth,
        btns: [...strip!.querySelectorAll('button')].map((b) => {
          const br = b.getBoundingClientRect();
          return { label: b.getAttribute('aria-label') ?? (b.textContent ?? '').trim().slice(0, 24), w: Math.round(br.width), right: Math.round(br.right), overflowRight: Math.round(Math.max(0, br.right - r.right)) };
        }),
      };
    });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    out.pickers1440 = await page.evaluate(() => {
      const pickers = [...document.querySelectorAll('button[data-slot="popover-trigger"]')] as HTMLElement[];
      return pickers.map((b) => {
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        return {
          text: (b.textContent ?? '').trim().slice(0, 18),
          cls: b.className.slice(0, 200),
          border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
          outline: `${cs.outlineWidth} ${cs.outlineStyle}`,
          boxShadow: cs.boxShadow,
          bg: cs.backgroundColor,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });
    });
    await page.screenshot({ path: 'artifacts/critic/arge-r10-precete-1440.png', clip: { x: 700, y: 700, width: 740, height: 260 } });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** Tur 5 — /bildirimler 390px: başlık/zaman genişlikleri, satır sarma; /onaylar 390px sekme şeridi kaydırma. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

async function run() {
  const out: Record<string, unknown> = {};
  const browser = await launchBrowser();
  try {
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/bildirimler', as: 'depo', base, dark: false });
      out['bildirimler390'] = await page.evaluate(`(() => {
        const r1 = (n) => Math.round(n * 10) / 10;
        return Array.from(document.querySelectorAll('main ul > li')).map((li) => {
          const title = li.querySelector('div.min-w-0 > div > div');
          const time = li.querySelector('span[class*="text-[11px]"]');
          const row = li.getBoundingClientRect();
          return {
            rowW: r1(row.width),
            titleW: r1(title.getBoundingClientRect().width),
            titleH: r1(title.getBoundingClientRect().height),
            timeW: r1(time.getBoundingClientRect().width),
            timePct: Math.round((time.getBoundingClientRect().width / row.width) * 100),
            lineHeight: getComputedStyle(title).lineHeight,
            text: (title.textContent || '').slice(0, 40),
          };
        });
      })()`);
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/onaylar', as: 'admin', base, dark: false });
      out['onaylar390tabs'] = await page.evaluate(`(() => {
        const tl = document.querySelector('[role="tablist"]');
        const tabs = tl.querySelectorAll('[role="tab"]');
        const first = tabs[0].getBoundingClientRect();
        const lastRight = Math.round(tabs[tabs.length - 1].getBoundingClientRect().right);
        tl.scrollLeft = 9999;
        const after = tl.scrollLeft;
        const firstAfter = tabs[0].getBoundingClientRect();
        tl.scrollLeft = 0;
        return { scrollW: tl.scrollWidth, clientW: tl.clientWidth, maxScroll: after, firstTabX: Math.round(first.x), firstTabXAfterScroll: Math.round(firstAfter.x), lastTabRightAtStart: lastRight, viewportW: innerWidth };
      })()`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r5e.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });

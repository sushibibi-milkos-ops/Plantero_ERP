/** Tur 13 kritik ölçümü (b) — klavye odak halkası, boş durum, mobil kart ofseti. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '9380c23c-1a10-43bc-a879-b98acc2e4cde';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // A) klavye odak halkası (gerçek Tab)
  for (const route of ['/arge/projeler', '/arge/receteler', `/arge/projeler/${PID}/receteler`, `/arge/projeler/${PID}/board`]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    const rings: unknown[] = [];
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const inMain = !!el.closest('main');
        return {
          inMain,
          tag: el.tagName,
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 26),
          outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
          shadow: cs.boxShadow.slice(0, 60),
          fv: el.matches(':focus-visible'),
        };
      });
      if (info && info.inMain) rings.push(info);
      if (rings.length >= 6) break;
    }
    out['focus_' + route.replace(/[^a-z]/gi, '_').slice(-14)] = rings;
    await ctx.close();
  }

  // B) boş durum (arama ile)
  for (const route of ['/arge/projeler', '/arge/receteler']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    const input = page.locator('input[aria-label="Tabloda ara"]').first();
    await input.fill('zzzzqqq');
    await page.waitForTimeout(700);
    out['empty_' + route.slice(6)] = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const txt = (main.textContent ?? '').replace(/\s+/g, ' ').trim();
      const svgs = [...main.querySelectorAll('svg')].filter((s) => {
        const r = s.getBoundingClientRect();
        return r.width >= 20 && r.height >= 20;
      }).length;
      const btns = [...main.querySelectorAll('button, a[data-slot="button"]')]
        .filter((b) => b.getBoundingClientRect().height > 0)
        .map((b) => (b.textContent ?? '').trim().slice(0, 24));
      return { hasRows: !!document.querySelector('tbody tr'), text: txt.slice(0, 260), bigSvgs: svgs, btns: btns.slice(-6) };
    });
    await ctx.close();
  }

  // C) mobil ilk kart ofseti (görünür eleman)
  for (const route of ['/arge/projeler', '/arge/receteler']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    out['mob_' + route.slice(6)] = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const cards = [...main.querySelectorAll('ul > li, [data-slot="card"]')].filter((e) => e.getBoundingClientRect().height > 0);
      const c = cards[0];
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return {
        firstCardTop_viewport: Math.round(r.top),
        firstCardTop_mainOffset: Math.round(r.top - main.getBoundingClientRect().top),
        cardH: Math.round(r.height * 10) / 10,
        count: cards.length,
      };
    });
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });

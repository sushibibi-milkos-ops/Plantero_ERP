/** Tur 13 (c) — boş durum ikonu/eylemi, odak halkası ayrıntısı, ekran görüntüsü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PID = '9380c23c-1a10-43bc-a879-b98acc2e4cde';

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  for (const route of ['/arge/projeler', '/arge/receteler']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    await page.locator('input[aria-label="Tabloda ara"]').first().fill('zzzzqqq');
    await page.waitForTimeout(800);
    out['empty_' + route.slice(6)] = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const svgs = [...main.querySelectorAll('svg')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }).map((s) => {
        const r = s.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top), cls: (s.getAttribute('class') ?? '').slice(0, 40) };
      });
      const emptyBlock = [...main.querySelectorAll('*')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.textContent ?? '').trim().startsWith('Eşleşen kayıt yok'); });
      const btns = [...main.querySelectorAll('button, a[data-slot="button"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((b) => (b.textContent ?? '').trim().slice(0, 24) || b.getAttribute('aria-label'));
      return { svgs: svgs.slice(-8), emptyBlockText: (emptyBlock?.textContent ?? '').trim().slice(0, 120), btns };
    });
    await page.screenshot({ path: `artifacts/critic/arge-r13-bos-${route.slice(6).replace(/\//g, '-')}.png` });
    await ctx.close();
  }

  // odak halkası ayrıntısı: gerçek Tab ile ana içerikteki ilk 5 durak, tam box-shadow/outline
  for (const route of ['/arge/projeler', `/arge/projeler/${PID}/receteler`, `/arge/projeler/${PID}/board`]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    // ana içeriğe atla: main içindeki ilk odaklanabilir elemana kadar Tab
    const rings: unknown[] = [];
    for (let i = 0; i < 60 && rings.length < 5; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || !el.closest('main')) return null;
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName,
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
          fv: el.matches(':focus-visible'),
          outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} off:${cs.outlineOffset}`,
          boxShadow: cs.boxShadow,
        };
      });
      if (info) rings.push(info);
    }
    out['focus_' + route.replace(/[^a-z]/gi, '').slice(-12)] = rings;
    if (route === '/arge/projeler') await page.screenshot({ path: 'artifacts/critic/arge-r13-focus-projeler.png' });
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });

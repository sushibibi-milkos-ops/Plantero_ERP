/** Tur 15 — odak halkası + satır hover + mobil kart ölçümü (salt okuma). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PID = '3c293a91-d8d6-4817-8c0d-b0df4223b5ee';

const readFocus = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { tag: el.tagName, label: (el.textContent ?? '').trim().slice(0, 26) || el.getAttribute('aria-label'), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 80) };
};

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler'], ['precete', `/arge/projeler/${PID}/receteler`], ['board', `/arge/projeler/${PID}/board`]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    // içerik alanındaki ilk etkileşimli öğeye odaklan: main içindeki ilk button/input/tr
    const seq: Array<Record<string, unknown> | null> = [];
    for (let i = 0; i < 26; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const inMain = !!el.closest('main');
        const cs = getComputedStyle(el);
        return { inMain, tag: el.tagName, label: (el.textContent ?? '').trim().slice(0, 26) || el.getAttribute('aria-label'), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset };
      });
      if (f?.inMain) { seq.push(f); if (seq.length >= 3) break; }
    }
    out[`${key}_focusInMain`] = seq;
    await ctx.close();
  }
  // mobil kart yüksekliği + dokunma hedefleri (gerçek kart listesi)
  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    out[`${key}_390cards`] = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const mainTop = main.getBoundingClientRect().top;
      const cards = [...main.querySelectorAll('a,li,article')].filter((n) => /₺/.test(n.textContent ?? '') && n.getBoundingClientRect().height > 40);
      const first = cards[0];
      return { count: cards.length, firstTop: first ? Math.round(first.getBoundingClientRect().top) : null, firstOffsetInMain: first ? Math.round(first.getBoundingClientRect().top - mainTop) : null, h: first ? Math.round(first.getBoundingClientRect().height * 10) / 10 : null };
    });
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });

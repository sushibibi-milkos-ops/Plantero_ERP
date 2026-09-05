/** Tur 5 — etkileşim durumları (hover/focus/active) + boş durum ölçümü. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

async function run() {
  const out: Record<string, unknown> = {};
  const browser = await launchBrowser();
  try {
    // --- /bildirimler (depo): hover + focus
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/bildirimler', as: 'depo', base, dark: false });
      const first = page.locator('main ul > li a, main ul > li button').first();
      const before = await first.evaluate((el) => getComputedStyle(el).backgroundColor);
      await first.hover();
      await page.waitForTimeout(250);
      const hovered = await first.evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, text: (el.textContent ?? '').slice(0, 30), outline: cs.outlineStyle + ' ' + cs.outlineWidth, boxShadow: cs.boxShadow.slice(0, 80) };
      });
      // odağı liste satırına taşı
      const rowFocus = await first.evaluate((el) => {
        (el as HTMLElement).focus();
        const cs = getComputedStyle(el);
        return { outline: cs.outlineStyle + ' ' + cs.outlineWidth, boxShadow: cs.boxShadow.slice(0, 120) };
      });
      const iconStyles = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main ul > li svg')).map((s) => ({ color: getComputedStyle(s).color, w: s.getBoundingClientRect().width })),
      );
      const transitions = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main *'))
          .map((el) => getComputedStyle(el).transition)
          .filter((t) => t && t !== 'all 0s ease 0s')
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 12),
      );
      out['bildirimler'] = { before, hovered, tabFocus: focus, rowFocus, iconStyles, transitions };
      await ctx.close();
    }
    // --- /bildirimler boş durum (admin)
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/bildirimler', as: 'admin', base, dark: false });
      out['bildirimlerEmpty'] = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        const box = main.querySelector('div.max-w-3xl')?.getBoundingClientRect();
        return {
          hasList: !!main.querySelector('ul'),
          text: (main.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
          boxWidth: box ? Math.round(box.width) : null,
          boxHeight: box ? Math.round(box.height) : null,
        };
      });
      await page.screenshot({ path: resolve(process.cwd(), 'artifacts/screens/bildirimler/desktop-empty.png'), fullPage: false, animations: 'disabled' });
      await ctx.close();
    }
    // --- /onaylar: hover + focus + active durumları, seçili satır
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/onaylar', as: 'admin', base, dark: false });
      const rows = page.locator('[role="option"]');
      const second = rows.nth(1);
      const before = await second.evaluate((el) => getComputedStyle(el).backgroundColor);
      await second.hover();
      await page.waitForTimeout(250);
      const hovered = await second.evaluate((el) => getComputedStyle(el).backgroundColor);
      // klavye: j ile ilerle
      await page.keyboard.press('j');
      await page.waitForTimeout(300);
      const afterJ = await page.evaluate(() => {
        const sel = document.querySelector('[role="option"][aria-selected="true"]') as HTMLElement;
        const cs = getComputedStyle(sel);
        return {
          index: Array.from(document.querySelectorAll('[role="option"]')).indexOf(sel),
          bg: cs.backgroundColor,
          boxShadow: cs.boxShadow.slice(0, 120),
          isActiveElement: document.activeElement === sel,
          title: (sel.querySelector('span.truncate')?.textContent ?? '').slice(0, 40),
        };
      });
      const btn = page.locator('[role="option"][aria-selected="true"] button').last();
      const btnStyles = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { transition: cs.transition, h: el.getBoundingClientRect().height, font: cs.fontSize, bg: cs.backgroundColor };
      });
      const transitions = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main *'))
          .map((el) => getComputedStyle(el).transition)
          .filter((t) => t && t !== 'all 0s ease 0s')
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 12),
      );
      const colors = await page.evaluate(() => {
        const set = new Set<string>();
        for (const el of Array.from(document.querySelectorAll('main *')).slice(0, 500)) {
          const cs = getComputedStyle(el);
          set.add(cs.color);
          if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') set.add('bg:' + cs.backgroundColor);
        }
        return Array.from(set);
      });
      out['onaylar'] = { before, hovered, afterJ, btnStyles, transitions, colors };
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r5b.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => { console.error(e); process.exit(1); });

/** Tur 11 — arge-recete-40 doğrulaması (390 satır dikey hizası) + klavye focus ring (tablo satırı, board kartı). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '75d786b3-35db-4191-b19e-8c77aa84bba5';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/projeler/' + PID + '/receteler', as: 'admin' });
    await page.waitForTimeout(400);
    out.precete_390_rowAlign = await page.evaluate(() => {
      const result: unknown[] = [];
      for (const r of [...document.querySelectorAll('[role="row"]')]) {
        if (!r.querySelector('[role="cell"]')) continue;
        const cells: HTMLElement[] = [];
        for (const c of [...r.querySelectorAll('[role="cell"]')]) if ((c as HTMLElement).offsetParent !== null) cells.push(c as HTMLElement);
        const kaynakCell = cells[2];
        const bCell = cells[3];
        if (!kaynakCell || !bCell) continue;
        let k: HTMLElement = kaynakCell;
        for (const ch of [...kaynakCell.children]) if ((ch as HTMLElement).offsetParent !== null) { k = ch as HTMLElement; break; }
        let b: HTMLElement = bCell;
        for (const ch of [...bCell.children]) if ((ch as HTMLElement).offsetParent !== null) { b = ch as HTMLElement; break; }
        const kr = k.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        result.push({
          row: (r.textContent ?? '').trim().slice(0, 16),
          kaynak: { t: (kaynakCell.textContent ?? '').trim().slice(0, 12), cy: Math.round(kr.top + kr.height / 2) },
          bMaliyet: { t: (bCell.textContent ?? '').trim().slice(0, 12), cy: Math.round(br.top + br.height / 2) },
          delta: Math.abs(Math.round(kr.top + kr.height / 2) - Math.round(br.top + br.height / 2)),
        });
      }
      return result;
    });
    await ctx.close();
  }

  // Klavye focus ring: tablo satırı (projeler) + board kartı
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/projeler', as: 'admin' });
    await page.evaluate(() => (document.querySelector('tbody tr') as HTMLElement).focus());
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    out.projeler_kbFocus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), txt: (el.textContent ?? '').trim().slice(0, 24), outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, offset: cs.outlineOffset, transform: cs.transform, transition: cs.transitionProperty + ' ' + cs.transitionDuration };
    });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/projeler/' + PID + '/board', as: 'admin' });
    await page.waitForTimeout(300);
    const card = page.locator('[data-slot="rnd-card"], article, [role="button"]').first();
    out.board_cardFocus = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[tabindex="0"]')] as HTMLElement[];
      const target = cards.find((c) => /Pazar araştırması/.test(c.textContent ?? ''));
      if (!target) return { found: false, tabbables: cards.length };
      target.focus();
      const cs = getComputedStyle(target);
      return { found: true, cls: target.className.slice(0, 120), outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, transition: cs.transitionProperty + ' ' + cs.transitionDuration };
    });
    // boş kolon durumu ve kolon genişlikleri
    out.board_cols = await page.evaluate(() => {
      const res: unknown[] = [];
      for (const h of [...document.querySelectorAll('h3, [data-slot="column-title"]')]) {
        const col = h.closest('div');
        res.push({ t: (h.textContent ?? '').trim().slice(0, 20), w: col ? Math.round(col.getBoundingClientRect().width) : null });
      }
      return res.slice(0, 8);
    });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

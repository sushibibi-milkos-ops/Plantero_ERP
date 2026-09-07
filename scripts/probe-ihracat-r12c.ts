/** Tur 12: sütun slack ölçümü — hücre metni canvas ile ölçülür, yatay padding eklenir. */
import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const SHIP = 'd9e73bbe-dabd-4bee-90f9-c0537d394bfa';
const CLOSED = '6cf7d83d-557e-4fd4-9ab8-a3431b6de65c';

async function cols(page: Page) {
  return page.evaluate(() => {
    // esbuild keepNames: evaluate içinde adlandırılmış fonksiyonlar __name sarmalayıcısı üretir
    (globalThis as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
    const t = document.querySelector('table');
    if (!t) return null;
    const canvas = document.createElement('canvas');
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) return null;
    const textW = (el: Element): number => {
      const cs = getComputedStyle(el as HTMLElement);
      ctx2.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      // rozet/ikon varsa kaba pay: her <svg> 16px, her rozet 24px iç dolgu
      const extra = el.querySelectorAll('svg').length * 20 + el.querySelectorAll('[data-slot="badge"]').length * 24;
      return Math.round(ctx2.measureText(txt).width + pad + extra);
    };
    const ths = Array.from(t.querySelectorAll('thead th'));
    const rows = Array.from(t.querySelectorAll('tbody tr'));
    return ths.map((th, i) => {
      const w = Math.round((th as HTMLElement).getBoundingClientRect().width);
      const vals = [textW(th), ...rows.map((r) => (r.children[i] ? textW(r.children[i]!) : 0))];
      const max = Math.max(...vals);
      return { h: (th.textContent ?? '').trim(), width: w, maxContent: max, slack: w - max };
    });
  });
}

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['belgeler', '/ihracat/belgeler'], ['kurlar', '/ihracat/kurlar'], ['gtip', '/ihracat/gtip']] as Array<[string, string]>) {
    await openRoute(page, { base: BASE, route, as: 'admin' });
    out[k] = await cols(page);
  }
  for (const [label, id] of [['detay', SHIP], ['kapali', CLOSED]] as Array<[string, string]>) {
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${id}`, as: 'admin' });
    for (const name of ['Sipariş satırları', 'Çeki listesi', 'Belgeler']) {
      await page.getByRole('tab', { name }).first().click();
      await page.waitForTimeout(500);
      out[`${label}:${name}`] = await cols(page);
    }
  }
  await ctx.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r12c.json', JSON.stringify(out, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Tur 10 kokpit prob-E: GERÇEK klavye (Tab) turunda odak halkası dili.
 * main içindeki ilk N odaklanabilir öğeyi Tab ile gezer, her birinde outline/boxShadow ölçer ve
 * "Tümü" bağlantısına gelindiğinde ekran görüntüsü alır.
 *   tsx scripts/probe-kokpit-r10e.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r10');

const ACTIVE = `(() => {
  const el = document.activeElement;
  if (!el) return null;
  const cs = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  return {
    tag: el.tagName,
    txt: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 42),
    inMain: !!el.closest('main'),
    outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
    boxShadow: cs.boxShadow === 'none' ? 'none' : (/inset/.test(cs.boxShadow) ? 'ring(inset)' : 'shadow'),
    ringPx: (cs.boxShadow.match(/0px 0px 0px (\\d+)px inset/) || [null, null])[1],
    bg: cs.backgroundColor,
    w: Math.round(b.width), h: Math.round(b.height),
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
    locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
  });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/kokpit', as: 'admin' });
  // odak main'in başına
  await page.evaluate(`(() => { const h = document.querySelector('main h1'); if (h) { h.setAttribute('tabindex','-1'); h.focus(); } })()`);
  const seen: unknown[] = [];
  let shotTumu = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const a = (await page.evaluate(ACTIVE)) as Record<string, unknown> | null;
    if (!a) continue;
    seen.push(a);
    if (!shotTumu && String(a.txt).startsWith('Tümü')) {
      await page.screenshot({ path: resolve(OUT, 'focus-tumu-1440.png'), animations: 'disabled' });
      shotTumu = true;
    }
  }
  await ctx.close();
  await browser.close();
  writeFileSync(resolve(OUT, 'probe-r10e.json'), JSON.stringify(seen, null, 2));
  console.error(JSON.stringify(seen.slice(0, 18), null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });

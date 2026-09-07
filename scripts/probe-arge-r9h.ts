/**
 * Tur 9h — iki kardeş tablo (projeler / receteler) anatomisi: thead zemini, kapsayıcı çerçevesi,
 * satır ayracı, sağa hizalı sütunlar.
 * Çıktı: artifacts/critic/probe-arge-r9h.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  const page = await ctx.newPage();

  for (const route of ['/arge/projeler', '/arge/receteler']) {
    await openRoute(page, { base, route, as: 'admin' });
    out[route] = await page.evaluate(() => {
      const table = document.querySelector('table');
      const thead = document.querySelector('thead tr') as HTMLElement | null;
      const th = document.querySelector('thead th') as HTMLElement | null;
      const tr = document.querySelector('tbody tr') as HTMLElement | null;
      const wrapper = table?.closest('div') as HTMLElement | null;
      const w = wrapper ? getComputedStyle(wrapper) : null;
      const t = thead ? getComputedStyle(thead) : null;
      const h = th ? getComputedStyle(th) : null;
      const r = tr ? getComputedStyle(tr) : null;
      return {
        wrapperCls: wrapper?.className.toString().slice(0, 120) ?? null,
        wrapperBorder: w ? `${w.borderTopWidth} ${w.borderTopStyle} ${w.borderTopColor}` : null,
        wrapperRadius: w?.borderRadius ?? null,
        wrapperBg: w?.backgroundColor ?? null,
        theadBg: t?.backgroundColor ?? null,
        thBg: h?.backgroundColor ?? null,
        thFont: h ? `${h.fontSize}/${h.fontWeight} ${h.color} tt=${h.textTransform} ls=${h.letterSpacing}` : null,
        thBorderBottom: h ? `${h.borderBottomWidth} ${h.borderBottomStyle} ${h.borderBottomColor}` : null,
        rowBorderBottom: r ? `${r.borderBottomWidth} ${r.borderBottomStyle} ${r.borderBottomColor}` : null,
        rowBg: r?.backgroundColor ?? null,
        rowHeight: tr ? +tr.getBoundingClientRect().height.toFixed(1) : null,
        tableCls: table?.className.toString().slice(0, 100) ?? null,
      };
    });
  }

  writeFileSync('artifacts/critic/probe-arge-r9h.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

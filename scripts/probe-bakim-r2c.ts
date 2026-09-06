/** Tur 2 — /bakim/is-emirleri liste tablosu sütun genişlikleri + /bakim/makineler sıfır hücre renkleri. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const tables = Array.from(document.querySelectorAll<HTMLElement>('main table')).filter((t) => t.getBoundingClientRect().width > 0);
  const t = tables[0];
  const out: Record<string, unknown> = { visibleTables: tables.length };
  if (t) {
    const holder = t.closest('[class*="overflow"]') as HTMLElement | null;
    out.table = {
      width: Math.round(t.getBoundingClientRect().width),
      holderClient: holder?.clientWidth ?? null,
      holderScroll: holder?.scrollWidth ?? null,
      cols: Array.from(t.querySelectorAll('thead th')).map((th) => ({
        t: (th.textContent || '').trim().slice(0, 14) || '(boş)',
        w: Math.round(th.getBoundingClientRect().width),
        right: Math.round(th.getBoundingClientRect().right),
        offscreen: th.getBoundingClientRect().right > (holder ? holder.getBoundingClientRect().right + 1 : 1e9),
      })),
    };
    // hücre bazında sıfır rengi (tüm td'ler, her sütun için ilk sıfır)
    const zero: Record<string, unknown> = {};
    for (const td of Array.from(t.querySelectorAll<HTMLTableCellElement>('tbody td'))) {
      const txt = (td.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^0\b/.test(txt)) continue;
      const target = (td.querySelector('span, div') as HTMLElement | null) ?? td;
      const key = String(td.cellIndex);
      if (!zero[key]) zero[key] = { text: txt.slice(0, 10), color: getComputedStyle(target).color, fontSize: getComputedStyle(target).fontSize };
    }
    out.zeroByCol = zero;
  }
  return out;
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const results: unknown[] = [];
  for (const spec of process.argv.slice(2)) {
    const [route, vp] = spec.split('|');
    const [w, h] = (vp ?? '1440x900').split('x').map(Number);
    const ctx = await browser.newContext({ viewport: { width: w!, height: h! }, isMobile: w! < 500, hasTouch: w! < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    try {
      await openRoute(page, { base, route: route!, as: 'admin' });
      results.push({ route, viewport: `${w}x${h}`, ...(await page.evaluate(collect)) });
    } catch (e) {
      results.push({ route, viewport: `${w}x${h}`, error: String(e).slice(0, 180) });
    }
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(results, null, 1));
}

main();

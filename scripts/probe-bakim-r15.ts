/** Tur 15 kritik ölçümü: OEE ondalık dağılımı, KPI şeridi @390, zaman çizgisi nabzı, boş durum. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) OEE hat tablosu ondalık dağılımı (1440)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/oee', as: 'bakim' });
    out.oeeDecimals = await page.evaluate(() => {
      const tbl = Array.from(document.querySelectorAll('table')).find((t) => t.textContent?.includes('HAT1'));
      if (!tbl) return null;
      const heads = Array.from(tbl.querySelectorAll('thead th')).map((h) => (h.textContent ?? '').trim());
      const rows = Array.from(tbl.querySelectorAll('tbody tr'));
      const res: Record<string, { values: string[]; decimals: number[] }> = {};
      heads.forEach((h, i) => {
        const vals = rows.map((r) => (r.children[i]?.textContent ?? '').trim()).filter((v) => v.includes('%'));
        if (!vals.length) return;
        res[h] = { values: vals, decimals: [...new Set(vals.map((v) => (v.split(',')[1] ?? '').length))] };
      });
      return res;
    });
    // zaman çizgisi nabzı (kapanmış iş emri)
    await openRoute(page, { base, route: '/bakim/is-emirleri/7ffa56f8-fb7b-4867-8c0f-d541b7818736', as: 'bakim' });
    out.doneOrderAnimations = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main *'))
        .filter((el) => getComputedStyle(el).animationName !== 'none')
        .map((el) => ({ cls: (el.className as string)?.slice?.(0, 90) ?? '', anim: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration })),
    );
    // boş durum
    await openRoute(page, { base, route: '/bakim/makineler?q=zzzyokk', as: 'bakim' });
    out.emptyMakineler = await page.evaluate(() => ({
      rows: document.querySelectorAll('tbody tr').length,
      text: (document.querySelector('main')?.textContent ?? '').includes('Eşleşen kayıt yok'),
    }));
    await ctx.close();
  }

  // 2) KPI şeridi @390
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const [key, route] of [['oee', '/bakim/oee'], ['makineler', '/bakim/makineler']] as const) {
      await openRoute(page, { base, route, as: 'bakim' });
      out[`kpi_${key}`] = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll<HTMLElement>('div,ul')).find(
          (d) => d.scrollWidth > d.clientWidth + 4 && d.clientWidth > 200 && d.children.length >= 3 && d.getBoundingClientRect().top < 500,
        );
        if (!el) return null;
        const cw = el.clientWidth;
        const full = Array.from(el.children).filter((c) => c.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1).length;
        return { scrollWidth: el.scrollWidth, clientWidth: cw, cards: el.children.length, fullyVisible: full };
      });
    }
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
